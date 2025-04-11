const axios = require('axios');
const dotenv = require('dotenv');
const Otp = require('../models/Otp');

dotenv.config();

// MSG91 Configuration from otp_project
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || "YOUR_MSG91_AUTH_KEY";
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || "MSGIND";
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || "YOUR_TEMPLATE_ID";

/**
 * Send OTP via MSG91 (based on otp_project implementation)
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
    
    // Format mobile for MSG91 (with country code)
    const formattedMobile = mobileNumber.startsWith('+') ? mobileNumber : `+91${mobileNumber}`;
    
    try {
      // Send OTP via MSG91 API (based on otp_project implementation)
      const response = await axios.post('https://control.msg91.com/api/v5/otp', {
        template_id: MSG91_TEMPLATE_ID,
        mobile: formattedMobile,
        otp: generatedOTP
      }, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authkey': MSG91_AUTH_KEY
        }
      });
      
      // Log the API response for debugging
      console.log('MSG91 API Response:', response.data);
      
      // As fallback, also try the alternative API from otp_project
      try {
        // Encoded URL for BhashSMS (based on otp_project)
        const bhashUrl = `https://bhashsms.com/api/sendmsg.php?user=success&pass=sms@1234&sender=BHAINF&phone=${mobileNumber}&text=Dear%20Customer,%20OTP%20is%20${generatedOTP},%20Thank%20you%20for%20using%20our%20service.-%20BhashSMS&priority=ndnd&stype=normal`;
        
        // Make a GET request to the alternative API
        const bhashResponse = await axios.get(bhashUrl);
        console.log('Bhash SMS Response:', bhashResponse.data);
      } catch (bhashError) {
        console.error('Bhash SMS Error:', bhashError.message);
        // We'll continue even if this fails as it's a fallback
      }
      
      // Return success with the request ID from MSG91
      return {
        success: true,
        message: 'OTP sent successfully',
        requestId: response.data.request_id || `local-${Date.now()}`,
        otp: process.env.NODE_ENV === 'development' ? generatedOTP : undefined
      };
    } catch (apiError) {
      console.error('MSG91 API Error:', apiError.message);
      
      // For development, still return the OTP
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          message: 'OTP created successfully (Development Mode)',
          requestId: `local-${Date.now()}`,
          otp: generatedOTP
        };
      }
      
      throw apiError;
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
    // Format mobile number with country code if needed
    const formattedMobile = mobileNumber.startsWith('+') ? mobileNumber : `+91${mobileNumber}`;
    
    // For development or when using a local request ID, verify against our database first
    if (process.env.NODE_ENV === 'development' || requestId.startsWith('local-')) {
      console.log('Using local OTP verification');
      const isValid = await exports.verifyLocalOTP(mobileNumber, otp);
      
      if (isValid) {
        return {
          success: true,
          message: 'OTP verified successfully (local verification)'
        };
      }
      
      // If local verification fails in production, try MSG91 API
      if (process.env.NODE_ENV !== 'development') {
        // Continue to MSG91 verification
        console.log('Local verification failed, trying MSG91 API');
      } else {
        // In development, just return the failure
        return {
          success: false,
          message: 'Invalid or expired OTP'
        };
      }
    }
    
    // Only attempt MSG91 verification if not in development mode or local failed
    if (process.env.NODE_ENV !== 'development') {
      try {
        console.log('Attempting MSG91 API verification');
        // Verify OTP via MSG91 API
        const response = await axios.post('https://control.msg91.com/api/v5/otp/verify', {
          otp: otp,
          mobile: formattedMobile
        }, {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authkey': MSG91_AUTH_KEY
          }
        });
        
        // Check if verification was successful
        const isSuccess = response.data && (response.data.type === 'success' || response.data.message === 'OTP verified success');
        
        // Handle specific authkey error
        if (response.data && response.data.code === '201') {
          console.error('MSG91 Authkey Error:', response.data.message);
          return {
            success: false,
            message: 'OTP verification service is temporarily unavailable. Please try again later.',
            data: response.data
          };
        }
        
        return {
          success: isSuccess,
          message: isSuccess ? 'OTP verified successfully' : 'Invalid or expired OTP',
          data: response.data
        };
      } catch (apiError) {
        console.error('MSG91 Verify API Error:', apiError.message);
        return {
          success: false,
          message: 'Failed to verify OTP with service provider. Please try again.',
          error: apiError.message
        };
      }
    }
    
    // This should only happen if we're in development and local verification failed
    return {
      success: false,
      message: 'Invalid or expired OTP'
    };
  } catch (error) {
    console.error('OTP Verification Error:', error);
    return {
      success: false,
      message: 'Failed to verify OTP. Please try again.',
      error: error.message
    };
  }
};

/**
 * Resend OTP
 * @param {string} mobileNumber - Mobile number to resend OTP to
 * @param {string} requestId - Request ID from send OTP operation
 * @param {string} retryType - Type of retry (text or voice)
 * @returns {Promise<Object>} - Result of the operation
 */
const resendOTP = async (mobileNumber, requestId, retryType = 'text') => {
  try {
    // Format mobile number with country code if needed
    const formattedMobile = mobileNumber.startsWith('+') ? mobileNumber : `+91${mobileNumber}`;
    
    // Check if we're using a local request ID (fallback)
    if (requestId && requestId.startsWith('local-')) {
      // Generate a new OTP
      return await sendOTP(mobileNumber);
    }
    
    try {
      // Resend OTP via MSG91 API
      const response = await axios.post('https://control.msg91.com/api/v5/otp/retry', {
        mobile: formattedMobile,
        retryType: retryType
      }, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authkey': MSG91_AUTH_KEY
        }
      });
      
      // Check if resend was successful
      const isSuccess = response.data && (response.data.type === 'success');
      
      if (isSuccess) {
        return {
          success: true,
          message: `OTP resent via ${retryType}`,
          requestId: response.data.request_id || requestId
        };
      } else {
        // If MSG91 fails, generate a new OTP
        return await sendOTP(mobileNumber);
      }
    } catch (apiError) {
      console.error('MSG91 Resend API Error:', apiError.message);
      
      // Generate a new OTP as fallback
      return await sendOTP(mobileNumber);
    }
  } catch (error) {
    console.error('OTP Resend Error:', error);
    return {
      success: false,
      message: 'Failed to resend OTP. Please try again.',
      error: error.message
    };
  }
};

// Generate a random 6-digit OTP
exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in the database
exports.storeOTP = async (mobile, otp) => {
  try {
    console.log('Storing OTP for mobile:', mobile);
    
    // Delete any existing OTP for this mobile
    await Otp.deleteMany({ mobile });
    console.log('Deleted existing OTPs for mobile:', mobile);
    
    // Create new OTP document
    const otpDoc = new Otp({
      mobile,
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
    console.log('Verifying OTP for mobile:', mobile);
    const otpDoc = await Otp.findOne({ 
      mobile,
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

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP
};