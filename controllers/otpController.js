const { sendOTP, verifyOTP, resendOTP } = require('../utils/otpService');
const User = require('../models/User');

/**
 * Send OTP to mobile number
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - Response with status and message
 */
exports.sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;
    console.log('Received send OTP request for mobile:', mobile);
    
    // Validate mobile number
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      console.log('Invalid mobile number:', mobile);
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }
    
    // Send OTP using local implementation
    console.log('Calling sendOTP service...');
    const otpResponse = await sendOTP(mobile);
    console.log('OTP service response:', otpResponse);
    
    if (otpResponse.success) {
      // Create the response
      const response = {
        success: true,
        message: 'OTP sent successfully',
        requestId: otpResponse.requestId
      };

      // For development mode, include the OTP but ONLY in console log
      // to avoid exposing it in API responses
      if (process.env.NODE_ENV === 'development' && otpResponse.otp) {
        console.log(`Development mode: OTP for ${mobile} is ${otpResponse.otp}`);
        // Still include the OTP in the response for development testing
        // but in production this would never be included
        if (process.env.NODE_ENV === 'development') {
          response.otp = otpResponse.otp;
        }
      }

      console.log('Sending success response:', response);
      // Return the response
      return res.status(200).json(response);
    } else {
      console.log('OTP service failed:', otpResponse.message);
      return res.status(400).json({
        success: false,
        message: otpResponse.message || 'Failed to send OTP'
      });
    }
  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sending OTP'
    });
  }
};

/**
 * Verify OTP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - Response with status and message
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { mobile, otp, requestId } = req.body;
    
    console.log(`OTP Verification Request - Mobile: ${mobile}, OTP: ${otp}, RequestID: ${requestId}`);
    
    // Validate inputs
    if (!mobile || !otp || !requestId) {
      console.log('OTP Verification Failed: Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Mobile number, OTP and request ID are required'
      });
    }
    
    if (!/^\d{6}$/.test(otp)) {
      console.log('OTP Verification Failed: OTP format invalid');
      return res.status(400).json({
        success: false,
        message: 'OTP must be a 6-digit number'
      });
    }
    
    // Verify OTP using verifyOTP function
    console.log('Calling verifyOTP function...');
    const verifyResponse = await verifyOTP(mobile, otp, requestId);
    console.log('Verify Response:', JSON.stringify(verifyResponse));
    
    if (verifyResponse.success) {
      console.log('OTP Verification Successful');
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully'
      });
    } else {
      console.log(`OTP Verification Failed: ${verifyResponse.message}`);
      return res.status(400).json({
        success: false,
        message: verifyResponse.message || 'Invalid or expired OTP'
      });
    }
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP'
    });
  }
};

/**
 * Resend OTP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - Response with status and message
 */
exports.resendOTP = async (req, res) => {
  try {
    const { mobile, requestId, retryType } = req.body;
    
    // Validate inputs
    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }
    
    // Generate and store a new OTP
    const resendResponse = await resendOTP(mobile, requestId, retryType);
    
    if (resendResponse.success) {
      // Create response
      const response = {
        success: true,
        message: `OTP resent successfully`,
        requestId: resendResponse.requestId
      };
      
      // For development mode, only log the OTP to console
      if (process.env.NODE_ENV === 'development' && resendResponse.otp) {
        console.log(`Development mode: Resent OTP for ${mobile} is ${resendResponse.otp}`);
        // Include OTP in response only in development mode
        if (process.env.NODE_ENV === 'development') {
          response.otp = resendResponse.otp;
        }
      }
      
      return res.status(200).json(response);
    } else {
      return res.status(400).json({
        success: false,
        message: resendResponse.message || 'Failed to resend OTP'
      });
    }
  } catch (error) {
    console.error('Resend OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while resending OTP'
    });
  }
}; 