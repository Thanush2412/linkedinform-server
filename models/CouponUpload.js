const mongoose = require('mongoose');

const couponUploadSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: false
  },
  mimeType: {
    type: String
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  fileSize: {
    type: Number
  },
  couponsAdded: {
    type: Number,
    default: 0
  },
  couponsUsed: {
    type: Number,
    default: 0
  },
  duplicatesSkipped: {
    type: Number,
    default: 0
  },
  errors: [{
    message: String,
    line: Number
  }],
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    default: null
  },
  coupons: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  }],
  metadata: {
    type: Object,
    default: {}
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'error'],
    default: 'completed'
  }
}, {
  timestamps: true
});

const CouponUpload = mongoose.model('CouponUpload', couponUploadSchema);

module.exports = CouponUpload; 