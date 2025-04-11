const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, isAdmin } = require('../middlewares/auth');
const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Admin routes (require admin privileges)
router.post('/upload', authenticate, isAdmin, upload.single('file'), couponController.uploadCoupons);
router.get('/', authenticate, isAdmin, couponController.getCoupons);
router.delete('/:id', authenticate, isAdmin, couponController.deleteCoupon);
router.patch('/:id/status', authenticate, isAdmin, couponController.updateCouponStatus);
router.get('/:id/stats', authenticate, isAdmin, couponController.getCouponStats);
router.get('/:id/export', authenticate, isAdmin, couponController.getCouponExportData);
router.get('/export', authenticate, isAdmin, couponController.exportAllCoupons);

// Public routes (for registration process)
router.post('/validate', authenticate, couponController.validateCoupon);
router.post('/apply', authenticate, couponController.applyCoupon);
router.post('/track-copy', couponController.trackCouponCopy); // No auth required to track copy events

module.exports = router;
