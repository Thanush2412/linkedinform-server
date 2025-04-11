const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  otp: {
    type: String,
    required: true,
    trim: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  expires_at: {
    type: Date,
    required: true,
    default: function() {
      return new Date(Date.now() + 5*60*1000); // 5 minutes expiry
    }
  }
}, {
  timestamps: true
});

// Create index for fast lookup by mobile
otpSchema.index({ mobile: 1 });

// Create TTL index for auto-deletion of expired OTPs
otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema); 