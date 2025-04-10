const mongoose = require('mongoose');

// This model serves as a master table to track relationships between forms, registrations, and coupons
const registrationCouponMappingSchema = new mongoose.Schema({
  registration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Registration',
    required: true
  },
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },
  couponCode: {
    type: String,
    trim: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date
  },
  redemptionUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create indexes for efficient querying
registrationCouponMappingSchema.index({ registration: 1 });
registrationCouponMappingSchema.index({ form: 1 });
registrationCouponMappingSchema.index({ coupon: 1 });
registrationCouponMappingSchema.index({ couponCode: 1 });

module.exports = mongoose.model('RegistrationCouponMapping', registrationCouponMappingSchema); 