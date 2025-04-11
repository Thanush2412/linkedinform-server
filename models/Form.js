const mongoose = require('mongoose');

// Define a schema for form fields
const formFieldSchema = new mongoose.Schema({
  fieldId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['text', 'email', 'number', 'tel', 'textarea', 'select', 'radio', 'checkbox', 'date']
  },
  label: {
    type: String,
    required: true
  },
  placeholder: String,
  required: {
    type: Boolean,
    default: false
  },
  options: [String], // For select, radio, checkbox
  defaultValue: mongoose.Schema.Types.Mixed,
  validations: {
    minLength: Number,
    maxLength: Number,
    pattern: String,
    min: Number,
    max: Number
  },
  order: {
    type: Number,
    default: 0
  },
  isPrimaryKey: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const formSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  college: {
    type: String,
    required: true,
    trim: true
  },
  activation: {
    type: Date,
    required: true
  },
  deactivation: {
    type: Date,
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  radius: {
    type: Number,
    required: true,
    default: 1 // Default radius in KM
  },
  requireLocation: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Custom fields configuration
  fields: {
    type: [formFieldSchema],
    default: [
      // Default fields that are always included
      {
        fieldId: 'name',
        type: 'text',
        label: 'Full Name',
        placeholder: 'Enter your full name',
        required: true,
        order: 1
      },
      {
        fieldId: 'email',
        type: 'email',
        label: 'Email Address',
        placeholder: 'Enter your email address',
        required: true,
        isPrimaryKey: true,
        order: 2
      },
      {
        fieldId: 'mobile',
        type: 'tel',
        label: 'Mobile Number',
        placeholder: 'Enter your 10-digit mobile number',
        required: true,
        isPrimaryKey: true,
        validations: {
          pattern: '^[0-9]{10}$'
        },
        order: 3
      },
      {
        fieldId: 'college',
        type: 'text',
        label: 'College',
        required: true,
        order: 4
      },
      {
        fieldId: 'register_number',
        type: 'text',
        label: 'Register Number',
        placeholder: 'Enter your register number',
        required: true,
        order: 5
      },
      {
        fieldId: 'yop',
        type: 'select',
        label: 'Year of Passing',
        required: true,
        options: Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() + i)),
        order: 6
      }
    ]
  },
  // Form appearance settings
  appearance: {
    title: {
      type: String,
      default: 'Student Registration'
    },
    description: String,
    primaryColor: {
      type: String,
      default: '#0d6efd' // Bootstrap primary color
    },
    buttonText: {
      type: String,
      default: 'Submit Registration'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create an index for querying active forms
formSchema.index({ activation: 1, deactivation: 1 });

// Add a method to check if form is active
formSchema.methods.checkIfActive = function() {
  const now = new Date();
  return now >= this.activation && now <= this.deactivation;
};

// Pre-save middleware to ensure email and mobile fields are always required and marked as primary keys
formSchema.pre('save', function(next) {
  // Find email and mobile fields
  const emailField = this.fields.find(field => field.fieldId === 'email');
  const mobileField = this.fields.find(field => field.fieldId === 'mobile');
  
  // Ensure email field exists and is properly configured
  if (emailField) {
    emailField.required = true;
    emailField.isPrimaryKey = true;
    emailField.type = 'email';
  }
  
  // Ensure mobile field exists and is properly configured
  if (mobileField) {
    mobileField.required = true;
    mobileField.isPrimaryKey = true;
    mobileField.type = 'tel';
    if (!mobileField.validations) {
      mobileField.validations = {};
    }
    if (!mobileField.validations.pattern) {
      mobileField.validations.pattern = '^[0-9]{10}$';
    }
  }
  
  next();
});

module.exports = mongoose.model('Form', formSchema); 