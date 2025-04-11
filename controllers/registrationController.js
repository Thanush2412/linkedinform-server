const Registration = require('../models/Registration');
const Form = require('../models/Form');
const mongoose = require('mongoose');


// Submit registration
exports.submitRegistration = async (req, res) => {
  try {
    const { 
      email, 
      mobile, 
      formSlug, 
      couponCode, 
      ...otherDetails 
    } = req.body;

    // Find the form
    const form = await Form.findOne({ slug: formSlug });
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Check if form is active
    const now = new Date();
    if (now < form.activation || now > form.deactivation) {
      return res.status(400).json({
        success: false,
        message: 'Form is not currently active'
      });
    }

    // Validate coupon if required
    let coupon = null;
    if (form.couponRequired) {
      if (!couponCode) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code is required for this form'
        });
      }

      // Find and validate coupon
      coupon = await Coupon.findOne({ 
        code: couponCode, 
        form: form._id,
        isUsed: false 
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or already used coupon'
        });
      }
    }

    // Check for existing registration
    const existingRegistration = await Registration.findOne({
      $or: [
        { email, form: form._id },
        { mobile, form: form._id }
      ]
    });

    if (existingRegistration) {
      return res.status(400).json({
        success: true,
        exists: true,
        message: 'Email or mobile already registered for this form',
        registration: {
          id: existingRegistration._id,
          couponCode: existingRegistration.couponCode || null
        },
        formStats: {
          registrationsCount: await Registration.countDocuments({ form: form._id })
        }
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

    // Create registration
    const registrationData = {
      email,
      mobile,
      form: form._id,
      ...otherDetails
    };

    // Create new registration
    const registration = new Registration({
      name: otherDetails.name,
      email,
      mobile,
      college: otherDetails.college,
      register_number: otherDetails.register_number,
      yop: otherDetails.yop,
      form: form._id,
      location: {
        latitude: otherDetails.latitude,
        longitude: otherDetails.longitude
      }
    });

    // Save registration
    await registration.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      registrationId: registration._id,
      formStats: {
        registrationsCount: await Registration.countDocuments({ form: form._id })
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit registration',
      error: error.message
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
    
    // Update the registration record
    registration.couponUsed = true;
    registration.couponUsedAt = new Date();
    await registration.save();
    
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
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      error: error.message
    });
  }
};