const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');

/**
 * @route POST /api/otp/send
 * @desc Send OTP to the provided mobile number
 * @access Public
 */
router.post('/send', otpController.sendOTP);

/**
 * @route POST /api/otp/verify
 * @desc Verify OTP for the provided mobile number
 * @access Public
 */
router.post('/verify', otpController.verifyOTP);

/**
 * @route POST /api/otp/resend
 * @desc Resend OTP for the provided mobile number
 * @access Public
 */
router.post('/resend', otpController.resendOTP);

module.exports = router; 