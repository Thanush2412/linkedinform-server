const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

    // Input validation
    if (!email || !email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid email address is required' 
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Validate role
    const validRoles = ['user', 'editor', 'admin', 'superadmin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role specified' 
      });
    }

    // Superadmin role restrictions - only superadmins can create other superadmins
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Only superadmin users can create other superadmin accounts' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already in use' 
      });
    }

    // Create user with all provided fields
    const userData = { 
      email, 
      password, 
      role: role || 'user',
      name: name || email.split('@')[0] // Use part of email as name if not provided
    };

    const user = new User(userData);
    await user.save();

    // Log the action
    console.log(`User created: ${email} (${role || 'user'}) by ${req.user.email}`);

    // Return success without the password
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: messages 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error creating user' 
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;
    const updates = {};
    
    if (email) updates.email = email;
    if (role) updates.role = role;
    if (name) updates.name = name;
    
    // If password is provided, it will be automatically hashed by the User model pre-save middleware
    if (password) updates.password = password;

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if updating email to one that already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }

    // Apply updates
    Object.assign(user, updates);
    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Bulk create users - superadmin only
exports.bulkCreateUsers = async (req, res) => {
  try {
    const { users } = req.body;
    
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of users to create' 
      });
    }
    
    // Process each user
    const results = {
      success: [],
      failures: []
    };
    
    for (const userData of users) {
      const { email, password, role, name } = userData;
      
      try {
        // Check for required fields
        if (!email || !password) {
          results.failures.push({
            email: email || 'Missing email',
            reason: 'Missing required fields'
          });
          continue;
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          results.failures.push({
            email,
            reason: 'Email already in use'
          });
          continue;
        }
        
        // Create the user
        const user = new User({
          email,
          password,
          role: role || 'user',
          name: name || email.split('@')[0]
        });
        
        await user.save();
        
        results.success.push({
          id: user._id,
          email: user.email,
          role: user.role,
          name: user.name
        });
        
      } catch (error) {
        results.failures.push({
          email: email || 'Unknown',
          reason: error.message || 'Unknown error'
        });
      }
    }
    
    // Return the results
    res.status(201).json({
      success: true,
      message: `Created ${results.success.length} out of ${users.length} users`,
      results
    });
    
  } catch (error) {
    console.error('Bulk create users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during bulk user creation' 
    });
  }
};

// Get user activity - superadmin only
exports.getUserActivity = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Here you would query an activity log collection
    // For now, we'll return a placeholder
    const activityLog = [
      {
        action: 'login',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        details: 'User login successful',
        ip: '127.0.0.1'
      },
      {
        action: 'password_change',
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        details: 'User changed password',
        ip: '127.0.0.1'
      }
    ];
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      activity: activityLog
    });
    
  } catch (error) {
    console.error('Get user activity error:', error);
    
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error retrieving user activity' 
    });
  }
}; 