/**
 * Script to create a superadmin user
 * Run with: node create-superadmin.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://thanush:MBInvI9LuXv5rpin@students-regsitration.ggrsmrl.mongodb.net/?retryWrites=true&w=majority&appName=Students-regsitration', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('MongoDB connected successfully');
    
    // Load User model
    const User = require('./models/User');
    
    // Generate a secure random password if not provided
    const generatePassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = '';
      for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };
    
    try {
      // Superadmin credentials - either from env, args or generated
      const superAdminEmail = process.env.SUPERADMIN_EMAIL || process.argv[2] || 'superadmin@example.com';
      const superAdminPassword = process.env.SUPERADMIN_PASSWORD || process.argv[3] || generatePassword();
      
      console.log('Creating superadmin user...');
      
      // Delete existing superadmin if requested via command line arg
      if (process.argv.includes('--force')) {
        console.log('Force flag detected. Removing existing superadmin users...');
        await User.deleteMany({ role: 'superadmin' });
      }
      
      // Create superadmin document
      const superAdmin = {
        email: superAdminEmail,
        password: superAdminPassword,
        name: 'Super Administrator',
        role: 'superadmin'
      };
      
      // Create or update the superadmin
      await User.findOneAndUpdate(
        { email: superAdminEmail },
        superAdmin,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      
      // Log the credentials to console
      console.log('\n==================================================');
      console.log('SUPERADMIN ACCOUNT CREATED/UPDATED:');
      console.log('--------------------------------------------------');
      console.log(`Email: ${superAdminEmail}`);
      console.log(`Password: ${superAdminPassword}`);
      console.log('==================================================\n');
      console.log('IMPORTANT: Save these credentials securely.');
      
      // Close MongoDB connection
      await mongoose.connection.close();
      console.log('Database connection closed');
      
    } catch (error) {
      console.error('Error creating superadmin:', error);
      await mongoose.connection.close();
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });