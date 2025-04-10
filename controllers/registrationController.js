const Registration = require('../models/Registration');
const Form = require('../models/Form');
const Coupon = require('../models/Coupon');
const RegistrationCouponMapping = require('../models/RegistrationCouponMapping');
const mongoose = require('mongoose');

// Submit registration
exports.submitRegistration = async (req, res) => {
  try {
    const { name, email, mobile, college, register_number, yop, slug, dynamicFields } = req.body;

    // Validate required fields
    if (!name || !email || !mobile || !college || !register_number || !yop || !slug) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required fields must be provided' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
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

    // Check if form is active
    if (!form.isActive) {
      return res.status(400).json({ 
        success: false, 
        message: 'This form is not currently active' 
      });
    }

    // Check if email is already registered for ANY form
    const existingEmailRegistration = await Registration.findOne({ email });

    if (existingEmailRegistration) {
      return res.status(400).json({ 
        success: false, 
        message: 'This email is already registered for another form' 
      });
    }

    // Check if mobile is already registered for ANY form
    const existingMobileRegistration = await Registration.findOne({ mobile });

    if (existingMobileRegistration) {
      return res.status(400).json({ 
        success: false, 
        message: 'This mobile number is already registered for another form' 
      });
    }

    // Check if registration limit has been reached (if limit is set)
    if (form.coupon_limit > 0) {
      // Count existing registrations for this form
      const registrationsCount = await Registration.countDocuments({ form: form._id });
      
      // Check if limit has been reached
      if (registrationsCount >= form.coupon_limit) {
        return res.status(400).json({
          success: false,
          message: 'Registration limit for this form has been reached'
        });
      }
    }

    // Check if there's an available coupon for this form
    let couponCode = null;
    let couponDoc = null;
    
    // Try to find the next available coupon code from the Coupon collection
    couponDoc = await Coupon.findOne({
      form: form._id,
      is_assigned: false  // Find a coupon that hasn't been assigned yet
    }).sort({ _id: 1 });  // Get the oldest one first (sequential order)

    if (couponDoc) {
      // Use the coupon code from the found coupon
      couponCode = couponDoc.coupon_code;
      
      // Mark the coupon as assigned
      couponDoc.is_assigned = true;
      couponDoc.assigned_to = email;
      couponDoc.assigned_at = new Date();
      await couponDoc.save();
    } else {
      // No available coupon in the database, generate a fallback one
      // This should be rare if you've loaded coupons properly
      couponCode = generateUniqueCouponCode();
      console.warn(`Warning: No available coupon found for form ${slug}. Using generated code instead.`);
    }

    // Create registration with coupon code
    const registration = new Registration({
      name,
      email,
      mobile,
      college,
      register_number,
      yop,
      form: form._id,
      couponCode,
      dynamicFields: dynamicFields || {}
    });

    // Save the registration
    await registration.save();

    // Create a mapping between registration and coupon if a coupon was assigned
    if (couponDoc) {
      const mapping = new RegistrationCouponMapping({
        registration: registration._id,
        coupon: couponDoc._id,
        form: form._id
      });
      await mapping.save();
    }

    // Return success response
    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully',
      data: {
        registration: {
          id: registration._id,
          name: registration.name,
          email: registration.email,
          mobile: registration.mobile,
          college: registration.college,
          register_number: registration.register_number,
          yop: registration.yop,
          couponCode: registration.couponCode
        }
      }
    });
  } catch (error) {
    console.error('Registration submission error:', error);
    
    // Handle duplicate key errors (unique constraint violations)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `This ${field} is already registered for this form`
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while submitting your registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

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
    
    // Update the mapping to mark the coupon as used
    const mapping = await RegistrationCouponMapping.findOneAndUpdate(
      {
        registration: registration._id,
        couponCode: couponCode
      },
      {
        isUsed: true,
        usedAt: new Date()
      },
      { new: true }
    );
    
    // Also update the registration record
    registration.couponUsed = true;
    registration.couponUsedAt = new Date();
    await registration.save();
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Coupon mapping not found'
      });
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
      error: error.message
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
    const limitReached = form.coupon_limit > 0 && registrationsCount >= form.coupon_limit;
    const remainingSlots = form.coupon_limit > 0 ? Math.max(0, form.coupon_limit - registrationsCount) : null;

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
          registrationsCount,
          couponLimit: form.coupon_limit,
          limitReached,
          remainingSlots
        }
      });
    }

    return res.status(200).json({
      success: true,
      exists: false,
      message: 'Email is not registered for this form',
      formStats: {
        registrationsCount,
        couponLimit: form.coupon_limit,
        limitReached,
        remainingSlots
      }
    });

  } catch (error) {
    console.error('Check email registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check email registration',
      error: error.message 
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
    const limitReached = form.coupon_limit > 0 && registrationsCount >= form.coupon_limit;
    const remainingSlots = form.coupon_limit > 0 ? Math.max(0, form.coupon_limit - registrationsCount) : null;

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
          registrationsCount,
          couponLimit: form.coupon_limit,
          limitReached,
          remainingSlots
        }
      });
    }

    // Return success response if mobile is not registered
    return res.status(200).json({
      success: true,
      exists: false,
      message: 'Mobile number is available for registration',
      formStats: {
        registrationsCount,
        couponLimit: form.coupon_limit,
        limitReached,
        remainingSlots
      }
    });
  } catch (error) {
    console.error('Mobile registration check error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while checking mobile registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 