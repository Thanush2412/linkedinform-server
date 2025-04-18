const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, isAdmin } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/coupons');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const upload = multer({ 
  storage: storage,
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

// Coupon Upload Management Routes
router.get('/uploads', authenticate, isAdmin, couponController.getCouponUploads);
router.get('/uploads/:id', authenticate, isAdmin, couponController.getCouponUploadDetails);
router.get('/uploads/:id/download', authenticate, isAdmin, couponController.downloadCouponFile);
router.delete('/uploads/:id', authenticate, isAdmin, couponController.deleteCouponUpload);
router.patch('/uploads/:id/update-count', authenticate, isAdmin, couponController.updateCouponUploadCount);

// Public routes (for registration process)
router.post('/validate', authenticate, couponController.validateCoupon);
router.post('/apply', authenticate, couponController.applyCoupon);
router.post('/track-copy', couponController.trackCouponCopy); // No auth required to track copy events
router.post('/track-bulk-copy', couponController.trackBulkCopy); // No auth required to track bulk copy events
router.get('/linkedin/:code', couponController.getLinkedInCouponUrl); // Get LinkedIn URL for a coupon

// Admin only routes
router.post('/upload-linkedin-coupons', authenticate, isAdmin, couponController.uploadLinkedInCoupons);

module.exports = router;
