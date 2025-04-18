const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Coupon routes
router.post('/upload', authenticate, isAdmin, couponController.uploadCoupons);
router.post('/:id/copy', authenticate, couponController.trackCouponCopy);
router.get('/', authenticate, isAdmin, couponController.getCoupons);
router.get('/:id', authenticate, isAdmin, couponController.getCouponById);
router.post('/', authenticate, isAdmin, couponController.createCoupon);
router.put('/:id', authenticate, isAdmin, couponController.updateCoupon);
router.delete('/:id', authenticate, isAdmin, couponController.deleteCoupon);

module.exports = router;
