const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.verifyGoogleToken);

// Protected routes
router.get('/profile', authMiddleware.authenticate, authController.getProfile);

module.exports = router; 