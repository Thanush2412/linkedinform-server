const { sendOTP, verifyLocalOTP, resendOTP } = require('../utils/otpService');
const User = require('../models/User');
const Otp = require('../models/Otp');
const otpService = require('../utils/otpService');

// Configure CORS for OTP routes
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

/**
 * Send OTP to mobile number
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - Response with status and message
 */
exports.sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    // Validate mobile number
    if (!mobile || !/^(\+91)?[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format'
      });
    }

    // Normalize mobile number
    const normalizedMobile = mobile.replace(/^\+91/, '');

    // Generate and send OTP
    const otpResult = await otpService.sendOTP(normalizedMobile);

    if (otpResult.success) {
      // Return response with OTP information
      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        requestId: otpResult.requestId,
        otp: otpResult.otp
      });
    } else {
      return res.status(500).json({
        success: false,
        message: otpResult.message || 'Failed to send OTP'
      });
    }
  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while sending OTP'
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
    const { mobile, otp } = req.body;

    // Validate inputs
    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required',
        errorCode: 'INVALID_INPUT'
      });
    }

    // Normalize mobile number
    const normalizedMobile = mobile.replace(/^\+91/, '');

    // Verify OTP using database
    const verificationResult = await otpService.verifyLocalOTP(normalizedMobile, otp);
    
    if (verificationResult) {
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP'
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during OTP verification',
      errorCode: 'SERVER_ERROR'
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