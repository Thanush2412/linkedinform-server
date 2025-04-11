const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

// Register a new admin user
exports.register = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    // Create new user
    const user = new User({
      email,
      password
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Login existing user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify Google ID token and return user info
exports.googleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      console.error('Google auth error: No token provided');
      return res.status(400).json({ success: false, message: 'No token provided' });
    }
    
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    console.log('Using Google Client ID:', googleClientId);
    
    // Using client secret along with client ID for better security
    const client = new OAuth2Client({
      clientId: googleClientId,
      clientSecret: "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" // Include client secret
    });

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: googleClientId
    });

    const payload = ticket.getPayload();
    console.log('Google auth payload received:', {
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    });
    
    const { email, name } = payload;

    // Return user data for client use (for registration form, not admin authentication)
    res.json({
      success: true,
      user: {
        email,
        name
      }
    });
  } catch (error) {
    console.error('Google auth error:', error.message, error.stack);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid Google token',
      error: error.message
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}; 