const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  isPercentage: {
    type: Boolean,
    default: true
  },
  maxUses: {
    type: Number,
    default: 1
  },
  usedCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Track which registrations have used this coupon
  usedBy: [{
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    discountApplied: {
      type: Number
    },
    // Additional tracking information
    employeeNumber: {
      type: String
    },
    userDetails: {
      name: String,
      email: String,
      phone: String
    },
    formDetails: {
      formId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Form'
      },
      college: String
    }
  }],
  // Track when the coupon code is copied
  copyEvents: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form'
    }
  }],
  // Track which form this coupon is associated with (optional)
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form'
  },
  // New field to store additional data from Excel/CSV
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

// Create index for faster lookups
couponSchema.index({ code: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
