const Registration = require('../models/Registration');
const Form = require('../models/Form');
const Coupon = require('../models/Coupon');
const CouponUpload = require('../models/CouponUpload');
const MasterData = require('../models/MasterData');
const mongoose = require('mongoose');
const User = require('../models/User');

// Submit registration
exports.submitRegistration = async (req, res) => {
  try {
    console.log('Registration submission request received', { body: req.body });
    
    const { 
      email, 
      mobile, 
      formSlug, 
      couponCode, 
      ...otherDetails 
    } = req.body;

    // Validate required fields
    if (!email || !mobile || !formSlug) {
      console.error('Missing required fields:', { email, mobile, formSlug });
      return res.status(400).json({
        success: false,
        message: 'Email, mobile, and formSlug are required fields'
      });
    }

    console.log('Processing registration submission:', { email, mobile, formSlug });

    // Find the form
    const form = await Form.findOne({ slug: formSlug });
    if (!form) {
      console.error(`Form not found with slug: ${formSlug}`);
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    console.log('Form found:', { formId: form._id, formSlug });

    // Check if form is active
    const now = new Date();
    if (now < form.activation || now > form.deactivation) {
      return res.status(400).json({
        success: false,
        message: 'Form is not currently active'
      });
    }

    // Check registration limit
    const registrationsCount = await Registration.countDocuments({ form: form._id });
    if (form.couponLimit > 0 && registrationsCount >= form.couponLimit) {
      return res.status(400).json({
        success: false,
        message: 'Registration limit for this form has been reached'
      });
    }

    // Check for existing registration
    const existingRegistration = await Registration.findOne({
      $or: [
        { email, form: form._id },
        { mobile, form: form._id }
      ]
    });

    if (existingRegistration) {
      console.log('User already registered:', { email, mobile, registrationId: existingRegistration._id });
      // Generate LinkedIn URL if the registration has a coupon
      let linkedInUrl = null;
      if (existingRegistration.couponCode) {
        try {
          linkedInUrl = formatLinkedInCouponUrl(existingRegistration.couponCode);
        } catch (err) {
          console.error('Error formatting LinkedIn URL:', err);
        }
      }
      
      return res.status(400).json({
        success: true,
        exists: true,
        message: 'Email or mobile already registered for this form',
        registration: {
          id: existingRegistration._id,
          couponCode: existingRegistration.couponCode || null,
          linkedInUrl: linkedInUrl
        },
        formStats: {
          registrationsCount: await Registration.countDocuments({ form: form._id })
        }
      });
    }

    // Create registration data with all required fields
    const registrationData = {
      email,
      mobile,
      form: form._id,
      name: otherDetails.name || 'Anonymous',
      college: otherDetails.college || form.college || 'Unknown',
      register_number: otherDetails.register_number || '',
      yop: otherDetails.yop || new Date().getFullYear().toString(),
      ...otherDetails
    };

    console.log('Creating registration with data:', registrationData);

    // Find an available coupon for the form
    try {
      // First try to find a coupon specifically assigned to this form's slug
      let availableCoupon = await Coupon.findOne({
        formId: form._id,
        isActive: true,
        isUsed: false,
        usedCount: 0
      });
      
      if (!availableCoupon) {
        console.log('No form-specific coupon found, searching for general coupons');
        // If no form-specific coupon found, get a general one
        availableCoupon = await Coupon.findOne({
          isActive: true,
          isUsed: false,
          usedCount: 0,
          formId: null // General coupon not tied to any specific form
        });
      }
      
      if (availableCoupon) {
        console.log('Found available coupon:', availableCoupon.code);
        registrationData.couponCode = availableCoupon.code;
        
        // Check if this coupon has a custom LinkedIn URL
        if (availableCoupon.linkedInUrl) {
          registrationData.linkedInUrl = availableCoupon.linkedInUrl;
          console.log('Using pre-defined LinkedIn URL:', availableCoupon.linkedInUrl);
        }
        
        // Mark coupon as used after registration is created
        availableCoupon.isUsed = true;
        availableCoupon.usedCount += 1;
        availableCoupon.usedBy.push({
          registrationId: null, // Will be updated after registration is saved
          usedAt: new Date(),
          userDetails: {
            name: otherDetails.name || '',
            email: email,
            mobile: mobile
          }
        });
        await availableCoupon.save();
        console.log('Coupon marked as used:', availableCoupon.code);
      } else {
        console.log('No available coupon found for assignment');
      }
    } catch (err) {
      console.error('Error assigning coupon:', err);
    }

    // Create new registration
    const registration = new Registration(registrationData);
    await registration.save();
    console.log('Registration saved successfully:', { registrationId: registration._id });

    // Sync to MasterData
    try {
      // Check if this registration already exists in master data
      let masterRecord = await MasterData.findOne({ 'registration.id': registration._id });
      
      // If master record doesn't exist, create a new one
      if (!masterRecord) {
        masterRecord = new MasterData();
        masterRecord.registration.id = registration._id;
      }
      
      // Update registration data
      masterRecord.registration.name = registration.name;
      masterRecord.registration.email = registration.email;
      masterRecord.registration.mobile = registration.mobile;
      masterRecord.registration.college = registration.college;
      masterRecord.registration.register_number = registration.register_number;
      masterRecord.registration.yop = registration.yop;
      masterRecord.registration.dynamicFields = registration.dynamicFields || {};
      masterRecord.registration.createdAt = registration.createdAt;
      masterRecord.registration.updatedAt = registration.updatedAt;
      masterRecord.registration.isActive = registration.isActive;
      masterRecord.registration.inactiveReason = registration.inactiveReason;
      masterRecord.registration.linkedInUrl = registration.linkedInUrl;
      
      // Update form data with more details
      masterRecord.form.id = form._id;
      masterRecord.form.slug = form.slug;
      masterRecord.form.college = form.college;
      masterRecord.form.employee_number = form.employee_number;
      masterRecord.form.activation = form.activation;
      masterRecord.form.deactivation = form.deactivation;
      masterRecord.form.isActive = form.isActive;
      masterRecord.form.created_by = form.created_by;
      masterRecord.form.couponLimit = form.couponLimit;
      masterRecord.form.fields = form.fields;
      masterRecord.form.latitude = form.latitude;
      masterRecord.form.longitude = form.longitude;
      masterRecord.form.radius = form.radius;
      masterRecord.form.requireLocation = form.requireLocation;
      masterRecord.form.appearance = form.appearance;
      
      // Update location if available
      if (registration.location) {
        masterRecord.location = registration.location;
      }
      
      // If there's a coupon code, sync coupon data with more details
      if (registration.couponCode) {
        const coupon = await Coupon.findOne({ code: registration.couponCode });
        
        if (coupon) {
          masterRecord.coupon.id = coupon._id;
          masterRecord.coupon.code = coupon.code;
          masterRecord.coupon.linkedInUrl = coupon.linkedInUrl;
          masterRecord.coupon.isUsed = registration.couponUsed || false;
          masterRecord.coupon.usedAt = registration.couponUsedAt;
          masterRecord.coupon.isActive = coupon.isActive;
          masterRecord.coupon.expiryDate = coupon.expiryDate;
          masterRecord.coupon.description = coupon.description;
          masterRecord.coupon.discount = coupon.discount;
          masterRecord.coupon.isPercentage = coupon.isPercentage;
          masterRecord.coupon.maxUses = coupon.maxUses;
          masterRecord.coupon.usedCount = coupon.usedCount;
          masterRecord.coupon.metadata = coupon.metadata;
          masterRecord.coupon.createdAt = coupon.createdAt;
          masterRecord.coupon.updatedAt = coupon.updatedAt;
          
          // If coupon has uploadId, sync coupon upload data
          if (coupon.uploadId) {
            try {
              const couponUpload = await CouponUpload.findById(coupon.uploadId);
              if (couponUpload) {
                masterRecord.couponUpload = {
                  id: couponUpload._id,
                  fileName: couponUpload.fileName,
                  originalName: couponUpload.originalName,
                  uploadDate: couponUpload.uploadDate,
                  uploadedBy: couponUpload.uploadedBy,
                  couponsAdded: couponUpload.couponsAdded,
                  couponsUsed: couponUpload.couponsUsed,
                  status: couponUpload.status,
                  metadata: couponUpload.metadata
                };
                
                // If user created the upload, add user data
                if (couponUpload.uploadedBy) {
                  try {
                    const user = await User.findById(couponUpload.uploadedBy);
                    if (user) {
                      masterRecord.user = {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        createdAt: user.createdAt
                      };
                    }
                  } catch (userError) {
                    console.error('Error fetching user data:', userError);
                  }
                }
              }
            } catch (uploadError) {
              console.error('Error fetching coupon upload data:', uploadError);
            }
          }
          
          // If coupon has createdBy, add user data
          if (coupon.createdBy) {
            try {
              const user = await User.findById(coupon.createdBy);
              if (user && !masterRecord.user) {
                masterRecord.user = {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  createdAt: user.createdAt
                };
              }
            } catch (userError) {
              console.error('Error fetching user data from coupon:', userError);
            }
          }
        } else {
          // Coupon code exists but coupon not found
          masterRecord.coupon.code = registration.couponCode;
          masterRecord.coupon.isUsed = registration.couponUsed || false;
          masterRecord.coupon.usedAt = registration.couponUsedAt;
        }
      } else {
        // Reset coupon data if no coupon code
        masterRecord.coupon = {
          code: null,
          isUsed: false
        };
      }
      
      // If form has created_by, add user data
      if (form.created_by && !masterRecord.user) {
        try {
          const user = await User.findById(form.created_by);
          if (user) {
            masterRecord.user = {
              id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              createdAt: user.createdAt
            };
          }
        } catch (userError) {
          console.error('Error fetching user data from form:', userError);
        }
      }
      
      // Update last sync time
      masterRecord.lastSync = new Date();
      
      // Save the master record
      await masterRecord.save();
      console.log('Registration synced to MasterData:', { masterRecordId: masterRecord._id });
    } catch (syncError) {
      console.error('Error syncing to MasterData:', syncError);
      // Continue with response even if sync fails
    }

    // Generate LinkedIn URL if needed
    let linkedInUrl = null;
    if (registration.linkedInUrl) {
      // Use pre-defined LinkedIn URL if available
      linkedInUrl = registration.linkedInUrl;
      console.log('Using pre-defined LinkedIn URL from coupon:', linkedInUrl);
    } else if (registration.couponCode) {
      // Generate URL from coupon code
      try {
        linkedInUrl = formatLinkedInCouponUrl(registration.couponCode);
        console.log('Generated LinkedIn URL from coupon code:', linkedInUrl);
      } catch (err) {
        console.error('Error formatting LinkedIn URL:', err);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      registrationId: registration._id,
      couponCode: registration.couponCode,
      linkedInUrl: linkedInUrl,
      formStats: {
        registrationsCount: await Registration.countDocuments({ form: form._id }),
        couponLimit: form.couponLimit,
        couponUsedCount: await Registration.countDocuments({ 
          form: form._id, 
          couponCode: { $exists: true, $ne: null }
        })
      }
    });

  } catch (error) {
    console.error('Registration error details:', error.message, error.stack);
    
    // Return a more descriptive error message
    res.status(500).json({
      success: false,
      message: 'Failed to submit registration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while processing your request'
    });
  }
};

// Helper function to format LinkedIn URL with coupon code
function formatLinkedInCouponUrl(couponCode) {
  if (!couponCode) return null;
  // Remove any prefix if it exists
  const cleanCode = couponCode.replace(/^THANKS-/i, '');
  // Format LinkedIn premium URL with the coupon code
  return `http://www.linkedin.com/premium/redeem/gift?_ed=${cleanCode}&mcid=7185883047605547008`;
}

// Helper function to generate a unique coupon code
function generateUniqueCouponCode() {
  // Create a more secure and unique code
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return timestamp + randomPart;
}

// Track coupon usage
exports.trackCouponUsage = async (req, res) => {
  try {
    const { email, couponCode, slug } = req.body;
    
    if (!email || !couponCode || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Email, coupon code, and form slug are required'
      });
    }
    
    // Find the form
    const form = await Form.findOne({ slug });
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    
    // Find the registration
    const registration = await Registration.findOne({
      email,
      form: form._id
    });
    
    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }
    
    // Update the registration record
    registration.couponUsed = true;
    registration.couponUsedAt = new Date();
    await registration.save();
    
    // Sync with MasterData
    try {
      // Find the corresponding master data record
      const masterRecord = await MasterData.findOne({ 'registration.id': registration._id });
      
      if (masterRecord) {
        // Update coupon usage data
        masterRecord.coupon.isUsed = true;
        masterRecord.coupon.usedAt = new Date();
        masterRecord.lastSync = new Date();
        
        // Save the updated master record
        await masterRecord.save();
        console.log('Coupon usage synced to MasterData:', { masterRecordId: masterRecord._id });
      } else {
        console.log('MasterData record not found for registration:', registration._id);
      }
    } catch (syncError) {
      console.error('Error syncing coupon usage to MasterData:', syncError);
      // Continue with response even if sync fails
    }
    
    return res.status(200).json({
      success: true,
      message: 'Coupon usage tracked successfully'
    });
    
  } catch (error) {
    console.error('Track coupon usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track coupon usage',
      error: 'An error occurred while processing your request'
    });
  }
};

// Check if email is already registered for a form
exports.checkEmailRegistration = async (req, res) => {
  try {
    const { email, slug } = req.body;

    // Validate required fields
    if (!email || !slug) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and form slug are required' 
      });
    }

    // Find the form
    const form = await Form.findOne({ slug });
    if (!form) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form not found' 
      });
    }

    // Get registration count for the form
    const registrationsCount = await Registration.countDocuments({ form: form._id });

    // Check if email is already registered for ANY form
    const existingRegistration = await Registration.findOne({ email });

    if (existingRegistration) {
      return res.status(200).json({ 
        success: true, 
        exists: true,
        message: 'This email is already registered for another form',
        registration: {
          name: existingRegistration.name,
          email: existingRegistration.email,
          mobile: existingRegistration.mobile,
          college: existingRegistration.college,
          register_number: existingRegistration.register_number,
          yop: existingRegistration.yop,
          createdAt: existingRegistration.createdAt,
          couponCode: existingRegistration.couponCode || null
        },
        formStats: {
          registrationsCount
        }
      });
    }

    return res.status(200).json({
      success: true,
      exists: false,
      message: 'Email is not registered for this form',
      formStats: {
        registrationsCount
      }
    });

  } catch (error) {
    console.error('Check email registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check email registration',
      error: 'An error occurred while processing your request' 
    });
  }
};

// Check if mobile number is already registered for any form
exports.checkMobileRegistration = async (req, res) => {
  try {
    const { mobile, slug } = req.body;

    // Validate required fields
    if (!mobile || !slug) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mobile number and form slug are required' 
      });
    }

    // Validate mobile number format (10 digits)
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }

    // Find the form
    const form = await Form.findOne({ slug });
    if (!form) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form not found' 
      });
    }

    // Get registration count for the form
    const registrationsCount = await Registration.countDocuments({ form: form._id });

    // Check if mobile is already registered for ANY form
    const existingRegistration = await Registration.findOne({ mobile });

    if (existingRegistration) {
      return res.status(200).json({ 
        success: true, 
        exists: true,
        message: 'This mobile number is already registered for another form',
        registration: {
          name: existingRegistration.name,
          email: existingRegistration.email,
          mobile: existingRegistration.mobile,
          college: existingRegistration.college,
          register_number: existingRegistration.register_number,
          yop: existingRegistration.yop,
          createdAt: existingRegistration.createdAt,
          couponCode: existingRegistration.couponCode || null
        },
        formStats: {
          registrationsCount
        }
      });
    }

    // Return success response if mobile is not registered
    return res.status(200).json({
      success: true,
      exists: false,
      message: 'Mobile number is available for registration',
      formStats: {
        registrationsCount
      }
    });
  } catch (error) {
    console.error('Mobile registration check error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while checking mobile registration',
      error: 'An error occurred while processing your request'
    });
  }
}; 

// Get form statistics
exports.getFormStats = async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Find the form
    const form = await Form.findOne({ slug });
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    
    // Get registration count
    const registrationsCount = await Registration.countDocuments({ form: form._id });
    
    return res.status(200).json({
      success: true,
      formStats: {
        registrationsCount
      }
    });
    
  } catch (error) {
    console.error('Error fetching form stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form stats',
      error: 'An error occurred while processing your request'
    });
  }
};

// Generate a unique coupon code
const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `THANKS-${code}`;
};

// Handle form registration
exports.register = async (req, res) => {
  try {
    const { slug } = req.params;
    const form = await Form.findOne({ slug });

    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }

    // Check if form is active
    if (!form.isActive) {
      return res.status(400).json({ success: false, message: 'Form is not active' });
    }

    // Generate a unique coupon code
    let couponCode = generateCouponCode();
    let couponExists = true;

    // Ensure the coupon code is unique
    while (couponExists) {
      couponCode = generateCouponCode();
      couponExists = await Coupon.findOne({ code: couponCode });
    }

    // Create coupon entry
    const coupon = new Coupon({
      code: couponCode,
      formId: form._id,
      createdBy: req.user._id,
      status: 'active'
    });

    await coupon.save();

    // Create registration entry
    const registration = new Registration({
      ...req.body,
      formId: form._id,
      couponCode: couponCode,
      registeredBy: req.user._id
    });

    await registration.save();

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful',
      couponCode: couponCode
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error during registration',
      error: error.message 
    });
  }
};