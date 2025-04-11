const axios = require('axios');
const dotenv = require('dotenv');
const Otp = require('../models/Otp');

dotenv.config();

// BhashSMS Configuration
const BHASHSMS_USER = process.env.BHASHSMS_USER || "success";
const BHASHSMS_PASSWORD = process.env.BHASHSMS_PASSWORD || "sms@1234";
const BHASHSMS_SENDER_ID = process.env.BHASHSMS_SENDER_ID || "BHAINF";

/**
 * Send OTP via BhashSMS
 * @param {string} mobileNumber - Mobile number to send OTP to
 * @returns {Promise<Object>} - Result of the operation
 */
const sendOTP = async (mobileNumber) => {
  try {
    // Generate a random 6-digit OTP
    const generatedOTP = exports.generateOTP();
    
    // Store OTP in database
    const stored = await exports.storeOTP(mobileNumber, generatedOTP);
    if (!stored) {
      return {
        success: false,
        message: 'Failed to generate OTP. Please try again.'
      };
    }
    
    // Prepare BhashSMS URL
    const bhashUrl = `https://bhashsms.com/api/sendmsg.php?user=${BHASHSMS_USER}&pass=${BHASHSMS_PASSWORD}&sender=${BHASHSMS_SENDER_ID}&phone=${mobileNumber}&text=Dear%20Customer,%20OTP%20is%20${generatedOTP},%20Thank%20you%20for%20using%20our%20service.-%20BhashSMS&priority=ndnd&stype=normal`;
    
    try {
      // Send OTP via BhashSMS
      const bhashResponse = await axios.get(bhashUrl);
      console.log('BhashSMS Response:', bhashResponse.data);
      
      return {
        success: true,
        message: 'OTP sent successfully',
        requestId: `${Date.now()}`,
        otp: generatedOTP
      };
    } catch (bhashError) {
      console.error('BhashSMS Error:', bhashError.message);
      
      return {
        success: false,
        message: 'Failed to send OTP via SMS. Please try again.',
        error: bhashError.message
      };
    }
  } catch (error) {
    console.error('OTP Service Error:', error);
    return {
      success: false,
      message: 'Failed to send OTP. Please try again later.',
      error: error.message
    };
  }
};

/**
 * Verify OTP
 * @param {string} mobileNumber - Mobile number to verify OTP for
 * @param {string} otp - OTP code to verify
 * @param {string} requestId - Request ID from send OTP operation
 * @returns {Promise<Object>} - Result of the operation
 */
const verifyOTP = async (mobileNumber, otp, requestId) => {
  try {
    console.log(`Verifying OTP - Mobile: ${mobileNumber}, OTP: ${otp}, RequestID: ${requestId}`);
    
    // Verify OTP using MSG91 API
    try {
      const response = await msg91.verifyOTP(otp, mobileNumber);
      if (response.success) {
        return {
          success: true,
          message: 'OTP verified successfully'
        };
      }
      throw new Error('Invalid OTP');
    } catch (error) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        message: 'Invalid OTP'
      };
    }
  } catch (error) {
    console.error('OTP Verification Error:', error);
    return {
      success: false,
      message: 'Failed to verify OTP. Please try again.',
      errorCode: 'SYSTEM_ERROR',
      error: error.message
    };
  }
};

/**
 * Resend OTP
 * @param {string} mobileNumber - Mobile number to resend OTP to
 * @param {string} requestId - Request ID from send OTP operation
 * @returns {Promise<Object>} - Result of the operation
 */
const resendOTP = async (mobileNumber, requestId) => {
  // Simply call sendOTP again to regenerate and resend
  return await sendOTP(mobileNumber);
};

// Generate a random 6-digit OTP
exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in the database
exports.storeOTP = async (mobile, otp) => {
  try {
    // Normalize mobile number by removing country code if present
    const normalizedMobile = mobile.replace(/^\+91/, '');
    
    console.log('Storing OTP for mobile:', normalizedMobile);
    
    // Delete any existing OTP for this mobile
    await Otp.deleteMany({ 
      $or: [
        { mobile: normalizedMobile },
        { mobile: `+91${normalizedMobile}` }
      ]
    });
    console.log('Deleted existing OTPs for mobile:', normalizedMobile);
    
    // Create new OTP document
    const otpDoc = new Otp({
      mobile: normalizedMobile,
      otp,
      expires_at: new Date(Date.now() + 5*60*1000) // 5 minutes expiry
    });
    
    console.log('Saving new OTP document:', otpDoc);
    await otpDoc.save();
    console.log('OTP saved successfully');
    return true;
  } catch (error) {
    console.error('Store OTP error:', error);
    return false;
  }
};

// Verify OTP against database
exports.verifyLocalOTP = async (mobile, providedOtp) => {
  try {
    // Normalize mobile number by removing country code if present
    const normalizedMobile = mobile.replace(/^\+91/, '');
    
    console.log('Verifying OTP for mobile:', normalizedMobile);
    const otpDoc = await Otp.findOne({ 
      $or: [
        { mobile: normalizedMobile },
        { mobile: `+91${normalizedMobile}` }
      ],
      otp: providedOtp,
      expires_at: { $gt: new Date() } // OTP must not be expired
    });
    
    console.log('Found OTP document:', otpDoc);
    
    if (!otpDoc) {
      console.log('No valid OTP found');
      return false;
    }
    
    // Mark as verified
    otpDoc.verified = true;
    await otpDoc.save();
    console.log('OTP verified successfully');
    
    return true;
  } catch (error) {
    console.error('Verify Local OTP error:', error);
    return false;
  }
};

// Export all functions
module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
  generateOTP,
  storeOTP,
  verifyLocalOTP
};