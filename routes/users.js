const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/auth');

// All routes are protected with authentication and admin middleware
// Only admin users can access these routes

// Get all users - accessible to both admin and superadmin
router.get('/', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.getAllUsers
);

// Get user by ID - accessible to both admin and superadmin
router.get('/:id', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.getUserById
);

// Create new user - accessible to both admin and superadmin
// Role authorization is checked inside the controller
router.post('/', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.createUser
);

// Update user - admins can update regular users, superadmins can update anyone
router.put('/:id', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.updateUser
);

// Delete user - superadmin can delete anyone, admin can delete non-admin users
router.delete('/:id', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.deleteUser
);

// Special routes for superadmins only

// Bulk operations - superadmin only
router.post('/bulk', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.bulkCreateUsers
);

// Get user activity log - superadmin only
router.get('/:id/activity', 
  authMiddleware.authenticate, 
  authMiddleware.isAdmin, 
  userController.getUserActivity
);

module.exports = router; 