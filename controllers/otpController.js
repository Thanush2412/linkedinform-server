const { sendOTP, verifyOTP, resendOTP } = require('../utils/otpService');
const User = require('../models/User');
const Otp = require('../models/Otp');

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
    console.log('OTP Send Request Received:', req.body);
    const { mobile } = req.body;

    // Validate mobile number
    if (!mobile) {
      console.warn('Send OTP: Mobile number is missing');
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    if (!/^\d{10}$/.test(mobile)) {
      console.warn(`Send OTP: Invalid mobile number format: ${mobile}`);
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }

    // Send OTP
    console.log(`Sending OTP to: ${mobile}`);
    const otpResult = await sendOTP(mobile);
    console.log('OTP Result:', { success: otpResult.success, message: otpResult.message });

    if (otpResult.success) {
      return res.status(200).json({
        success: true,
        message: otpResult.message || 'OTP sent successfully',
        requestId: otpResult.requestId,
        otp: otpResult.otp
      });
    } else {
      console.error('OTP Sending Failed:', otpResult.message);
      return res.status(400).json({
        success: false,
        message: otpResult.message || 'Failed to send OTP'
      });
    }
  } catch (error) {
    console.error('Send OTP Server Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while sending OTP. Please try again.',
      errorDetail: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Validate inputs
    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required',
        errorCode: 'INVALID_INPUT'
      });
    }

    console.log(`OTP Controller - Verify OTP: Mobile=${mobile}, OTP=${otp}, RequestID=${requestId}`);

    // Verify OTP using service
    const verificationResult = await verifyOTP(mobile, otp, requestId);
    
    if (verificationResult.success) {
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully'
      });
    }

    return res.status(400).json({
      success: false,
      message: verificationResult.message || 'Invalid or expired OTP'
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