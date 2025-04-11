const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  coupon_code: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  is_assigned: {
    type: Boolean,
    default: false
  },
  assigned_to: {
    type: String,
    trim: true
  },
  assigned_at: {
    type: Date
  }
}, {
  timestamps: true
});

// Create indexes for efficient querying
couponSchema.index({ form: 1, is_assigned: 1 });
couponSchema.index({ assigned_to: 1 });

module.exports = mongoose.model('Coupon', couponSchema); 