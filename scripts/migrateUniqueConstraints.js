/**
 * Migration script to update existing registrations to ensure email and mobile number uniqueness
 * 
 * This script will:
 * 1. Find all registrations with duplicate email or mobile numbers
 * 2. Keep the most recent registration for each email/mobile combination
 * 3. Mark older registrations as inactive
 * 
 * Run this script with: node scripts/migrateUniqueConstraints.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Registration = require('../models/Registration');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://thanush:MBInvI9LuXv5rpin@students-regsitration.ggrsmrl.mongodb.net/?retryWrites=true&w=majority&appName=Students-regsitration';

async function migrateUniqueConstraints() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB successfully');

    // Find all registrations
    const registrations = await Registration.find({});
    console.log(`Found ${registrations.length} total registrations`);

    // Group registrations by email and form
    const emailFormGroups = {};
    registrations.forEach(reg => {
      const key = `${reg.email}-${reg.form}`;
      if (!emailFormGroups[key]) {
        emailFormGroups[key] = [];
      }
      emailFormGroups[key].push(reg);
    });

    // Group registrations by mobile and form
    const mobileFormGroups = {};
    registrations.forEach(reg => {
      const key = `${reg.mobile}-${reg.form}`;
      if (!mobileFormGroups[key]) {
        mobileFormGroups[key] = [];
      }
      mobileFormGroups[key].push(reg);
    });

    // Find duplicate email-form combinations
    const duplicateEmailForms = Object.entries(emailFormGroups)
      .filter(([_, regs]) => regs.length > 1)
      .map(([key, regs]) => ({ key, registrations: regs }));

    // Find duplicate mobile-form combinations
    const duplicateMobileForms = Object.entries(mobileFormGroups)
      .filter(([_, regs]) => regs.length > 1)
      .map(([key, regs]) => ({ key, registrations: regs }));

    console.log(`Found ${duplicateEmailForms.length} duplicate email-form combinations`);
    console.log(`Found ${duplicateMobileForms.length} duplicate mobile-form combinations`);

    // Process duplicate email-form combinations
    let emailDuplicatesProcessed = 0;
    for (const { key, registrations: regs } of duplicateEmailForms) {
      // Sort by creation date (newest first)
      regs.sort((a, b) => b.createdAt - a.createdAt);
      
      // Keep the newest registration, mark others as inactive
      const [newest, ...older] = regs;
      console.log(`Processing ${key}: keeping newest (${newest._id}), marking ${older.length} as inactive`);
      
      // Update older registrations
      for (const oldReg of older) {
        await Registration.updateOne(
          { _id: oldReg._id },
          { $set: { isActive: false, inactiveReason: 'Duplicate email address' } }
        );
        emailDuplicatesProcessed++;
      }
    }

    // Process duplicate mobile-form combinations
    let mobileDuplicatesProcessed = 0;
    for (const { key, registrations: regs } of duplicateMobileForms) {
      // Sort by creation date (newest first)
      regs.sort((a, b) => b.createdAt - a.createdAt);
      
      // Keep the newest registration, mark others as inactive
      const [newest, ...older] = regs;
      console.log(`Processing ${key}: keeping newest (${newest._id}), marking ${older.length} as inactive`);
      
      // Update older registrations
      for (const oldReg of older) {
        await Registration.updateOne(
          { _id: oldReg._id },
          { $set: { isActive: false, inactiveReason: 'Duplicate mobile number' } }
        );
        mobileDuplicatesProcessed++;
      }
    }

    console.log(`Migration completed successfully`);
    console.log(`Processed ${emailDuplicatesProcessed} duplicate email registrations`);
    console.log(`Processed ${mobileDuplicatesProcessed} duplicate mobile registrations`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

// Run the migration
migrateUniqueConstraints();