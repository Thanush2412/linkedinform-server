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
    unique: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  college: {
    type: String,
    required: true,
    trim: true
  },
  register_number: {
    type: String,
    required: true,
    trim: true
  },
  yop: {
    type: String,
    required: true,
    trim: true
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
  // Reason for inactivity (for migration purposes)
  inactiveReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create indexes for common queries
registrationSchema.index({ email: 1 }, { unique: true });
registrationSchema.index({ mobile: 1 }, { unique: true });
registrationSchema.index({ form: 1 });
registrationSchema.index({ yop: 1, createdAt: 1 });
registrationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Registration', registrationSchema); 