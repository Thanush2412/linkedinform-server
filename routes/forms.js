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

// Debug route to help troubleshoot API issues
router.get('/debug', (req, res) => {
  // Log headers for debugging
  console.log('Request headers:', req.headers);
  
  // Check for authorization header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(200).json({
      success: false,
      message: 'Debug info: No Authorization header found',
      fix: 'Make sure your client is sending the Authorization header with Bearer token'
    });
  }
  
  // Try to extract token
  const token = authHeader.replace('Bearer ', '');
  if (!token || token === authHeader) {
    return res.status(200).json({
      success: false,
      message: 'Debug info: Authorization header does not contain a valid Bearer token',
      fix: 'Format should be: Authorization: Bearer YOUR_TOKEN'
    });
  }
  
  // Try to decode token without verification
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    
    return res.status(200).json({
      success: true,
      message: 'Debug info: Token format appears valid',
      tokenInfo: {
        decoded,
        expires: decoded ? new Date(decoded.exp * 1000).toISOString() : 'Unknown'
      },
      routes: {
        root: '/api/forms - Requires auth',
        all: '/api/forms/all - Requires auth',
        debug: '/api/forms/debug - No auth required'
      }
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      message: 'Debug info: Cannot decode token',
      error: error.message
    });
  }
});

// Public forms list for debugging
router.get('/public-list', async (req, res) => {
  try {
    const Form = require('../models/Form');
    const forms = await Form.find()
      .select('college slug activation deactivation _id')
      .sort({ createdAt: -1 })
      .limit(10);
    
    return res.status(200).json({
      success: true,
      message: 'Public forms list for debugging',
      data: forms
    });
  } catch (error) {
    console.error('Error in public forms list:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in public forms list',
      error: error.message
    });
  }
});

// Public routes
router.get('/details/:slug', formController.getFormBySlug);
router.get('/stats/:slug', formController.getFormStats);

// Employee route - get forms by employee number (no authentication required for restricted users)
router.get('/employee/:employeeNumber', formController.getFormsByEmployeeNumber);

// Root route - also gets all forms
router.get('/', authMiddleware.authenticate, authMiddleware.isAdmin, formController.getAllForms);

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