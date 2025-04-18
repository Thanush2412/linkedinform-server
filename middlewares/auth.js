const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token missing' });
    }

    // Check if this is an employee access token
    if (token === 'user-access-token') {
      // For employee login (restricted access), we don't verify with JWT
      // Instead, check if the request has the employee number in the query or body
      const employeeNumber = req.query.employeeNumber || req.body.employeeNumber;
      
      if (!employeeNumber) {
        return res.status(401).json({ 
          success: false, 
          message: 'Employee number is required for restricted access' 
        });
      }
      
      // Create a minimal user object for the request
      req.user = {
        role: 'user',
        employeeNumber: employeeNumber,
        name: `User ${employeeNumber}`,
        _id: 'employee-user'
      };
      
      return next();
    }

    // Regular JWT verification for normal users
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by id
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// This middleware allows access to both admin and superadmin with equal permissions
// According to requirements, admin and superadmin should have the same permissions
exports.isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Access denied: Admin role required' });
  }
};

// This middleware specifically checks for user access to summary page
// All authenticated users can access the summary page
exports.canAccessSummary = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Access denied: Authentication required' });
  }
};