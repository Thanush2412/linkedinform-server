const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');

// Public routes
router.post('/submit', registrationController.submitRegistration);
router.post('/check-email', registrationController.checkEmailRegistration);
router.post('/check-mobile', registrationController.checkMobileRegistration);
router.post('/track-coupon', registrationController.trackCouponUsage);

module.exports = router; 