const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Server Configuration
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
const API_PREFIX = process.env.API_PREFIX || '/api';

// CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? [`http://localhost:${process.env.CLIENT_PORT || '3000'}`] 
    : process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Import routes
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const registrationRoutes = require('./routes/registrations');
const couponRoutes = require('./routes/coupons');
const summaryRoutes = require('./routes/summary');
const otpRoutes = require('./routes/otpRoutes');
const userRoutes = require('./routes/users');

// Route middleware
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/forms`, formRoutes);
app.use(`${API_PREFIX}/registrations`, registrationRoutes);
app.use(`${API_PREFIX}/coupons`, couponRoutes);
app.use(`${API_PREFIX}/summary`, summaryRoutes);
app.use(`${API_PREFIX}/otp`, otpRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);

// Health check endpoint
app.get(`${API_PREFIX}/health`, (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || `mongodb://${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '27017'}/${process.env.DB_NAME || 'student_registration'}`;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected successfully');
    
    // Initialize default admin users if they don't exist
    const User = require('./models/User');
    
    // Function to create default admin and superadmin if they don't exist
    async function createDefaultUsersIfNeeded() {
      try {
        // Check if superadmin exists first
        const superAdminCount = await User.countDocuments({ role: 'superadmin' });
        console.log(`Checking for superadmin: Found ${superAdminCount} superadmin users`);
        
        // Check if any admin user exists
        const adminCount = await User.countDocuments({ role: 'admin' });
        console.log(`Checking for admin: Found ${adminCount} admin users`);
        
        if (adminCount === 0) {
          console.log('No admin users found. Creating default admin user...');
          
          // Default admin credentials
          const defaultAdmin = {
            email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com',
            password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
            name: 'Default Admin',
            role: 'admin'
          };
          
          // Create the user
          const newAdmin = new User(defaultAdmin);
          await newAdmin.save();
          
          console.log(`Default admin created with email: ${defaultAdmin.email}`);
        }
        
        if (superAdminCount === 0) {
          console.log('No superadmin users found. Creating superadmin user...');
          
          // Generate a secure random password if not provided in env
          const generatePassword = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            let password = '';
            for (let i = 0; i < 12; i++) {
              password += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return password;
          };
          
          // Superadmin credentials - either from env or generated
          const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@example.com';
          const superAdminPassword = process.env.SUPERADMIN_PASSWORD || generatePassword();
          
          const superAdmin = {
            email: superAdminEmail,
            password: superAdminPassword,
            name: 'Super Administrator',
            role: 'superadmin'
          };
          
          // Create the superadmin
          const newSuperAdmin = new User(superAdmin);
          await newSuperAdmin.save();
          
          // Log the credentials to console for initial setup
          console.log('\n==================================================');
          console.log('SUPERADMIN ACCOUNT CREATED:');
          console.log('--------------------------------------------------');
          console.log(`Email: ${superAdminEmail}`);
          console.log(`Password: ${superAdminPassword}`);
          console.log('==================================================\n');
          console.log('IMPORTANT: Save these credentials securely. This message will only appear once.');
        }
      } catch (error) {
        console.error('Error creating default users:', error);
      }
    }
    
    // Run the user initialization
    createDefaultUsersIfNeeded();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});