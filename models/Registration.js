const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please provide a valid email address']
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{10}$/, 'Please provide a valid 10-digit mobile number']
  },
  college: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  register_number: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  yop: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  location: {
    type: {
      latitude: Number,
      longitude: Number
    },
    required: false
  },
  // Store additional dynamic form fields
  dynamicFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Flag to mark registrations as inactive (for migration purposes)
  isActive: {
    type: Boolean,
    default: true
  },
  // Inactivity reason
  inactiveReason: {
    type: String,
    trim: true
  },
  // Coupon related fields
  couponCode: {
    type: String,
    trim: true
  },
  // Custom LinkedIn URL (if provided from coupon)
  linkedInUrl: {
    type: String,
    trim: true
  },
  couponUsed: {
    type: Boolean,
    default: false
  },
  couponUsedAt: {
    type: Date
  },
  // Attendance tracking
  attendance: {
    type: Boolean,
    default: false
  },
  attendanceMarkedBy: {
    type: String,
    trim: true
  },
  attendanceMarkedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Create indexes for common queries, but without uniqueness constraints
registrationSchema.index({ email: 1, form: 1 }, { unique: true }); // Unique per form
registrationSchema.index({ mobile: 1, form: 1 }, { unique: true }); // Unique per form
registrationSchema.index({ form: 1 });
registrationSchema.index({ yop: 1, createdAt: 1 });
registrationSchema.index({ isActive: 1 });
registrationSchema.index({ couponCode: 1 }); // Index for coupon code lookups
registrationSchema.index({ attendance: 1 });

module.exports = mongoose.model('Registration', registrationSchema); 