const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middlewares/auth');
const couponController = require('../controllers/couponController');
const Coupon = require('../models/Coupon');

// Configure multer for file uploads with better error handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'coupons-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter - only accept Excel files
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'application/vnd.ms-excel' || 
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Handle multer errors
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 5MB limit'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// All coupon routes are protected
router.use(authMiddleware.authenticate);

// Admin-only routes
router.use('/upload', authMiddleware.isAdmin);

// Upload coupons from Excel file
router.post('/upload', upload.single('file'), handleMulterErrors, couponController.uploadCoupons);

// Assign coupon to a registration (accessible to authenticated users)
router.post('/assign', couponController.assignCoupon);

// Get available coupons count for a form
router.get('/available/:formId', couponController.getAvailableCouponsCount);

module.exports = router; 