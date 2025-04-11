const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const authMiddleware = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `form-upload-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ storage });

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

const excelUpload = multer({ 
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

// Public routes
router.get('/details/:slug', formController.getFormBySlug);
router.get('/stats/:slug', formController.getFormStats);

// Protected routes
router.post(
  '/create',
  authMiddleware.authenticate,
  authMiddleware.isAdmin,
  upload.single('file'),
  formController.createForm
);

// Upload Excel data for forms
router.post(
  '/upload-excel',
  authMiddleware.authenticate,
  authMiddleware.isAdmin,
  excelUpload.single('file'),
  handleMulterErrors,
  formController.uploadExcelData
);

router.get(
  '/all',
  authMiddleware.authenticate,
  authMiddleware.isAdmin,
  formController.getAllForms
);

// New routes for edit and delete
router.put(
  '/:formId',
  authMiddleware.authenticate,
  authMiddleware.isAdmin,
  formController.updateForm
);

router.delete(
  '/:formId',
  authMiddleware.authenticate,
  authMiddleware.isAdmin,
  formController.deleteForm
);

module.exports = router; 