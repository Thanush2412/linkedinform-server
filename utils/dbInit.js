require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://thanush:MBInvI9LuXv5rpin@students-regsitration.ggrsmrl.mongodb.net/?retryWrites=true&w=majority&appName=Students-regsitration';
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB Connected...');
    return true;
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
};

// Create default admin user
const createAdminUser = async () => {
  try {
    // Check if admin user already exists
    const adminExists = await User.findOne({ email: 'admin@example.com' });
    
    if (adminExists) {
      console.log('Admin user already exists. Skipping creation.');
      return;
    }
    
    // Create new admin user
    const newAdmin = new User({
      email: 'admin@example.com',
      password: 'admin123',
      role: 'admin'
    });
    
    await newAdmin.save();
    console.log('Default admin user created:');
    console.log('- Email: admin@example.com');
    console.log('- Password: admin123');
    
  } catch (err) {
    console.error('Error creating admin user:', err.message);
    process.exit(1);
  }
};

// Main function
const initDatabase = async () => {
  const connected = await connectDB();
  
  if (connected) {
    await createAdminUser();
    console.log('Database initialization complete!');
    process.exit(0);
  }
};

// Run the initialization
initDatabase();

async function initDefaultAdmin() {
  try {
    // Check if any admin user exists
    const adminCount = await User.countDocuments({ role: 'admin' });
    
    if (adminCount === 0) {
      console.log('No admin users found. Creating default admin user...');
      
      // Default admin credentials (ideally should come from env variables in production)
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
    } else {
      console.log(`${adminCount} admin users already exist. No default admin created.`);
    }
    
    // Check for superadmin
    const superadminCount = await User.countDocuments({ role: 'superadmin' });
    
    if (superadminCount === 0) {
      console.log('No superadmin users found. Creating default superadmin user...');
      
      // Default superadmin credentials
      const defaultSuperadmin = {
        email: process.env.DEFAULT_SUPERADMIN_EMAIL || 'superadmin@example.com',
        password: process.env.DEFAULT_SUPERADMIN_PASSWORD || 'Super@123',
        name: 'Default Superadmin',
        role: 'superadmin'
      };
      
      // Create the superadmin
      const newSuperadmin = new User(defaultSuperadmin);
      await newSuperadmin.save();
      
      console.log(`Default superadmin created with email: ${defaultSuperadmin.email}`);
    } else {
      console.log(`${superadminCount} superadmin users already exist. No default superadmin created.`);
    }
    
    // Disconnect from MongoDB after initialization
    mongoose.disconnect();
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Error initializing database:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Run this script directly with: node utils/dbInit.js