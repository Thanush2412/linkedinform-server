const mongoose = require('mongoose');

const masterDataSchema = new mongoose.Schema({
  // Registration data
  registration: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration'
    },
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    mobile: {
      type: String,
      trim: true
    },
    college: {
      type: String,
      trim: true
    },
    register_number: {
      type: String,
      trim: true
    },
    yop: {
      type: String,
      trim: true
    },
    dynamicFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
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
    },
    createdAt: {
      type: Date
    },
    updatedAt: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    inactiveReason: {
      type: String,
      trim: true
    },
    linkedInUrl: {
      type: String,
      trim: true
    }
  },
  
  // OTP data
  otp: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Otp'
    },
    mobile: {
      type: String,
      trim: true
    },
    verified: {
      type: Boolean,
      default: false
    },
    expires_at: {
      type: Date
    },
    createdAt: {
      type: Date
    }
  },
  
  // Form data
  form: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Registration'
    },
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    mobile: {
      type: String,
      trim: true
    },
    college: {
      type: String,
      trim: true
    },
    register_number: {
      type: String,
      trim: true
    },
    yop: {
      type: String,
      trim: true
    },
    dynamicFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date
    },
    updatedAt: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    inactiveReason: {
      type: String,
      trim: true
    },
    linkedInUrl: {
      type: String,
      trim: true
    }
  },
  
  // Form data
  form: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form'
    },
    slug: {
      type: String,
      trim: true
    },
    college: {
      type: String,
      trim: true
    },
    employee_number: {
      type: String,
      trim: true
    },
    activation: {
      type: Date
    },
    deactivation: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    couponLimit: {
      type: Number,
      default: 0
    },
    fields: {
      type: Array,
      default: []
    },
    latitude: {
      type: Number
    },
    longitude: {
      type: Number
    },
    radius: {
      type: Number
    },
    requireLocation: {
      type: Boolean
    },
    appearance: {
      type: Object,
      default: {}
    }
  },
  
  // Coupon data
  coupon: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon'
    },
    code: {
      type: String,
      trim: true
    },
    linkedInUrl: {
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
    copyTime: {
      type: Number
    },
    copyEvents: [{
      timestamp: { type: Date },
      viewTime: { type: Date },
      ipAddress: { type: String },
      userAgent: { type: String },
      source: { type: String },
      formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
      formSlug: { type: String },
      formName: { type: String },
      linkedInUrl: { type: String },
      registrationTime: { type: Date },
      formData: { type: mongoose.Schema.Types.Mixed },
      fromSuccessBanner: { type: Boolean }
    }],
    usedBy: [{
      registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
      usedAt: { type: Date },
      discountApplied: { type: Number },
      employeeNumber: { type: String },
      userDetails: {
        name: String,
        email: String,
        phone: String
      },
      formDetails: {
        formId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form' },
        college: String
      }
    }],
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    expiryDate: {
      type: Date
    },
    description: {
      type: String
    },
    discount: {
      type: Number
    },
    isPercentage: {
      type: Boolean
    },
    maxUses: {
      type: Number
    },
    usedCount: {
      type: Number
    },
    metadata: {
      type: Object,
      default: {}
    },
    createdAt: {
      type: Date
    },
    updatedAt: {
      type: Date
    }
  },
  
  // Coupon Upload data
  couponUpload: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CouponUpload'
    },
    fileName: {
      type: String
    },
    originalName: {
      type: String
    },
    uploadDate: {
      type: Date
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    couponsAdded: {
      type: Number
    },
    couponsUsed: {
      type: Number
    },
    status: {
      type: String
    },
    metadata: {
      type: Object,
      default: {}
    }
  },
  
  // User data
  user: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String
    },
    email: {
      type: String
    },
    role: {
      type: String
    },
    createdAt: {
      type: Date
    }
  },
  
  // Location information
  location: {
    latitude: Number,
    longitude: Number
  },
  
  // Timestamps for when this record was last updated in the master table
  lastSync: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for faster querying
masterDataSchema.index({ 'registration.email': 1 });
masterDataSchema.index({ 'registration.mobile': 1 });
masterDataSchema.index({ 'form.slug': 1 });
masterDataSchema.index({ 'coupon.code': 1 });
masterDataSchema.index({ 'registration.createdAt': 1 });
masterDataSchema.index({ 'registration.isActive': 1 });
masterDataSchema.index({ 'registration.college': 1 });
masterDataSchema.index({ 'registration.dynamicFields.employee_number': 1 });
masterDataSchema.index({ 'user.email': 1 });

const MasterData = mongoose.model('MasterData', masterDataSchema);

module.exports = MasterData;