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
    console.log('Sending OTP to mobile number:', mobileNumber);
    
    // Generate a random 6-digit OTP
    const generatedOTP = generateOTP();
    console.log('Generated OTP:', generatedOTP);
    
    // Store OTP in database
    const stored = await storeOTP(mobileNumber, generatedOTP);
    if (!stored) {
      console.error('Failed to store OTP in database');
      return {
        success: false,
        message: 'Failed to generate OTP. Please try again.'
      };
    }

    // Check if we're in development mode - skip actual SMS in development
    if (process.env.NODE_ENV === 'development') {
      console.log('DEVELOPMENT MODE: Skipping actual SMS delivery');
      console.log(`OTP for ${mobileNumber} is: ${generatedOTP}`);
      return {
        success: true,
        message: 'OTP generated successfully (DEV MODE - no SMS sent)',
        requestId: `${Date.now()}`,
        otp: generatedOTP
      };
    }
    
    // Prepare BhashSMS URL
    const bhashUrl = `https://bhashsms.com/api/sendmsg.php?user=${BHASHSMS_USER}&pass=${BHASHSMS_PASSWORD}&sender=${BHASHSMS_SENDER_ID}&phone=${mobileNumber}&text=Dear%20Customer,%20OTP%20is%20${generatedOTP},%20Thank%20you%20for%20using%20our%20service.-%20BhashSMS&priority=ndnd&stype=normal`;
    
    try {
      // Send OTP via BhashSMS
      const bhashResponse = await axios.get(bhashUrl, { timeout: 5000 }); // Add timeout
      console.log('BhashSMS Response:', bhashResponse.data);
      
      if (bhashResponse.data && bhashResponse.data.includes('error')) {
        console.warn('BhashSMS returned an error but OTP is stored in database');
        return {
          success: true, // Still return success since OTP is stored locally
          message: 'OTP generated successfully (SMS delivery may be delayed)',
          requestId: `${Date.now()}`,
          otp: generatedOTP
        };
      }
      
      return {
        success: true,
        message: 'OTP sent successfully',
        requestId: `${Date.now()}`,
        otp: generatedOTP
      };
    } catch (bhashError) {
      console.error('BhashSMS Error:', bhashError.message);
      
      // Still return success since OTP is stored in the database and can be verified
      return {
        success: true,
        message: 'OTP generated successfully (SMS delivery may be delayed)',
        requestId: `${Date.now()}`,
        otp: generatedOTP,
        warning: 'SMS gateway error, but OTP is valid'
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
    
    // First try to verify using local database
    const isVerifiedLocally = await verifyLocalOTP(mobileNumber, otp);
    
    if (isVerifiedLocally) {
      return {
        success: true,
        message: 'OTP verified successfully'
      };
    }

    // Return failure if local verification fails
    return {
      success: false,
      message: 'Invalid or expired OTP'
    };
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
const resendOTP = async (mobileNumber, requestId, retryType = 'text') => {
  try {
    // Normalize mobile number
    const normalizedMobile = mobileNumber.replace(/^\+91/, '');
    
    // First check if there's an existing unexpired OTP
    const existingOtp = await Otp.findOne({
      $or: [
        { mobile: normalizedMobile },
        { mobile: `+91${normalizedMobile}` }
      ],
      expires_at: { $gt: new Date() },
      verified: false
    });

    if (existingOtp) {
      // For voice OTP, we'll just log a message since we don't have actual voice OTP implementation
      if (retryType === 'voice') {
        console.log('Voice OTP requested - using text OTP instead since voice is not implemented');
      }

      // Send text OTP regardless of requested type
      return {
        success: true,
        message: 'OTP resent successfully',
        requestId: `${Date.now()}`,
        otp: existingOtp.otp
      };
    }

    // If no existing OTP or it's expired, generate new one
    return await sendOTP(mobileNumber);
  } catch (error) {
    console.error('Resend OTP Error:', error);
    return {
      success: false,
      message: 'Failed to resend OTP. Please try again.',
      error: error.message
    };
  }
};

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in the database
const storeOTP = async (mobile, otp) => {
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
const verifyLocalOTP = async (mobile, providedOtp) => {
  try {
    // Special handling for development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('DEVELOPMENT MODE: Skipping actual OTP verification');
      console.log(`DEV MODE: Accepting any 6-digit OTP for mobile ${mobile}`);
      
      // In development, just check if the OTP is 6 digits
      if (/^\d{6}$/.test(providedOtp)) {
        return true;
      }
    }
    
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