const Form = require('../models/Form');
const Coupon = require('../models/Coupon');
const mongoose = require('mongoose');
const fs = require('fs');
const Registration = require('../models/Registration');

// Generate a random slug
const generateSlug = () => {
  return Math.random().toString(36).substring(2, 11);
};

// Create a new form
exports.createForm = async (req, res) => {
  try {
    console.log('Form data received:', JSON.stringify(req.body));
    console.log('File received:', req.file);
    
    // Extract form data - handle both JSON and multipart/form-data
    const college = req.body.college;
    const activation = req.body.activation;
    const deactivation = req.body.deactivation;
    
    // Clean and parse numeric values
    let latitude, longitude, radius, coupon_limit;
    
    try {
      latitude = parseFloat(String(req.body.latitude || '').trim());
      // Remove any trailing commas and convert to number
      longitude = parseFloat(String(req.body.longitude || '').trim().replace(/,+$/, ''));
      radius = parseFloat(String(req.body.radius || '').trim());
      coupon_limit = parseInt(String(req.body.coupon_limit || '0').trim());
    } catch (parseError) {
      console.error('Error parsing numeric values:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid numeric values provided',
        error: parseError.message,
        receivedData: req.body
      });
    }
    
    console.log('Cleaned numeric values:', {
      latitude,
      longitude,
      radius,
      coupon_limit
    });
    
    // Validate basic fields
    if (!college || !activation || !deactivation || isNaN(latitude) || isNaN(longitude) || isNaN(radius)) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required fields must be provided with valid values',
        receivedData: req.body
      });
    }

    // Extract custom fields if provided
    let fields = [];
    if (req.body.fields) {
      try {
        // If fields is a string (from form-data), parse it
        if (typeof req.body.fields === 'string') {
          fields = JSON.parse(req.body.fields);
        } else {
          fields = req.body.fields;
        }
      } catch (err) {
        console.error('Error parsing fields:', err);
        // If there's an error, use default fields defined in the model
        fields = undefined;
      }
    }

    // Extract appearance settings if provided
    let appearance = {};
    if (req.body.appearance) {
      try {
        // If appearance is a string (from form-data), parse it
        if (typeof req.body.appearance === 'string') {
          appearance = JSON.parse(req.body.appearance);
        } else {
          appearance = req.body.appearance;
        }
      } catch (err) {
        console.error('Error parsing appearance:', err);
        // If there's an error, use default appearance defined in the model
        appearance = undefined;
      }
    }

    // Process coupons
    let coupons = [];
    
    // If a file was uploaded, process it
    if (req.file) {
      const fs = require('fs');
      
      // Read the file line by line
      try {
        console.log('Processing file:', req.file.path);
        
        if (!fs.existsSync(req.file.path)) {
          console.error('File does not exist:', req.file.path);
          return res.status(400).json({
            success: false,
            message: 'Uploaded file could not be found'
          });
        }
        
        const fileContents = fs.readFileSync(req.file.path, 'utf8');
        console.log('File contents (first 100 chars):', fileContents.substring(0, 100));
        
        const lines = fileContents.split('\n');
        console.log(`File contains ${lines.length} lines`);
        
        // Process each line, removing any headers
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            // If line contains commas, assume it's a CSV and take the first column
            const parts = line.split(',');
            coupons.push(parts[0]);
          }
        }
        
        console.log(`Processed ${coupons.length} coupons from file`);
        
        // Clean up the uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting temp file:', unlinkError);
        }
      } catch (err) {
        console.error('Error processing coupon file:', err);
      }
    }
    
    // Create default coupons if none provided
    if (coupons.length === 0) {
      // Generate some default coupons
      coupons = Array.from({length: 10}, (_, i) => `DEFAULT_${i+1}`);
      console.log('Created default coupons:', coupons);
    }

    // Create slug
    const slug = generateSlug();
    console.log('Generated slug:', slug);

    try {
      // Create form without using transactions
      const formData = {
        slug,
        college,
        activation,
        deactivation,
        latitude,
        longitude,
        radius,
        coupon_limit,
        created_by: req.user._id
      };

      // Add custom fields and appearance if provided
      if (fields) formData.fields = fields;
      if (appearance) formData.appearance = appearance;

      const form = new Form(formData);

      console.log('Saving form:', form);
      const savedForm = await form.save();
      console.log('Form saved successfully with ID:', savedForm._id);

      // Create coupons
      const couponDocs = coupons.map(code => ({
        coupon_code: code,
        form: savedForm._id,
        is_assigned: false
      }));

      console.log(`Inserting ${couponDocs.length} coupons`);
      const savedCoupons = await Coupon.insertMany(couponDocs);
      console.log(`${savedCoupons.length} coupons saved successfully`);

      // Return success response
      res.status(201).json({
        success: true,
        message: 'Form created successfully',
        data: {
          slug,
          college,
          activation,
          deactivation,
          fields: savedForm.fields,
          appearance: savedForm.appearance
        }
      });
    } catch (error) {
      console.error('Error saving form or coupons:', error);
      return res.status(500).json({
        success: false,
        message: 'Error saving data to database',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Create form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
};

// Get form details by slug
exports.getFormBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // Find form by slug
    const form = await Form.findOne({ slug });

    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }

    // Check if form is active
    const now = new Date();
    const isActive = now >= new Date(form.activation) && now <= new Date(form.deactivation);

    // Return form details with fields and appearance
    res.json({
      success: true,
      data: {
        college: form.college,
        activation: form.activation,
        deactivation: form.deactivation,
        latitude: form.latitude,
        longitude: form.longitude,
        radius: form.radius,
        isActive,
        fields: form.fields || [],
        appearance: form.appearance || {
          title: 'Student Registration',
          buttonText: 'Submit Registration',
          primaryColor: '#0d6efd'
        }
      }
    });
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all forms for admin users
exports.getAllForms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const includeCreator = req.query.includeCreator === 'true';
    
    // For admin and superadmin users, show all forms regardless of creator
    // This ensures all forms are visible to all admin accounts
    let query = {};
    
    // Always populate the created_by field to ensure creator information is available
    let forms = await Form.find(query)
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Transform the forms to include creator_name for frontend display
    forms = forms.map(form => {
      const formObj = form.toObject();
      // Add creator_name property that the frontend is expecting
      formObj.creator_name = formObj.created_by ? formObj.created_by.name : 'Unknown user';
      // Ensure created_by is properly populated
      if (formObj.created_by && !formObj.created_by.name) {
        formObj.created_by.name = 'Unknown user';
      }
      return formObj;
    });

    // Count total forms
    const total = await Form.countDocuments(query);

    // Return forms
    res.json({
      success: true,
      data: {
        forms,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      }
    });
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update an existing form
exports.updateForm = async (req, res) => {
  try {
    const { formId } = req.params;
    
    // Extract form data
    const college = req.body.college;
    const activation = req.body.activation;
    const deactivation = req.body.deactivation;
    const latitude = parseFloat(String(req.body.latitude || '').trim().replace(/,+$/, ''));
    const longitude = parseFloat(String(req.body.longitude || '').trim().replace(/,+$/, ''));
    const radius = parseFloat(String(req.body.radius || '').trim());
    const coupon_limit = parseInt(String(req.body.coupon_limit || '0').trim());
    
    // Validate basic fields
    if (!college || !activation || !deactivation || isNaN(latitude) || isNaN(longitude) || isNaN(radius)) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required fields must be provided with valid values',
        receivedData: req.body
      });
    }
    
    // Find the form by ID
    const form = await Form.findById(formId);
    
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }
    
    // Check if user has permission to update this form
    // Allow any admin or superadmin to update any form, regardless of who created it
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && form.created_by.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to update this form' });
    }
    
    // Extract custom fields if provided
    if (req.body.fields) {
      try {
        // If fields is a string (from form-data), parse it
        if (typeof req.body.fields === 'string') {
          form.fields = JSON.parse(req.body.fields);
        } else {
          form.fields = req.body.fields;
        }
      } catch (err) {
        console.error('Error parsing fields:', err);
        // Don't update fields if there's an error
      }
    }

    // Extract appearance settings if provided
    if (req.body.appearance) {
      try {
        // If appearance is a string (from form-data), parse it
        if (typeof req.body.appearance === 'string') {
          form.appearance = JSON.parse(req.body.appearance);
        } else {
          form.appearance = req.body.appearance;
        }
      } catch (err) {
        console.error('Error parsing appearance:', err);
        // Don't update appearance if there's an error
      }
    }
    
    // Update basic form fields
    form.college = college;
    form.activation = activation;
    form.deactivation = deactivation;
    form.latitude = latitude;
    form.longitude = longitude;
    form.radius = radius;
    form.coupon_limit = coupon_limit;
    
    await form.save();
    
    // Return success response
    res.json({
      success: true,
      message: 'Form updated successfully',
      data: form
    });
  } catch (error) {
    console.error('Update form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete a form
exports.deleteForm = async (req, res) => {
  try {
    const { formId } = req.params;
    
    // Find the form by ID
    const form = await Form.findById(formId);
    
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }
    
    // Check if user has permission to delete this form
    // Allow any admin or superadmin to delete any form, regardless of who created it
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && form.created_by.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this form' });
    }
    
    // Delete associated coupons
    await Coupon.deleteMany({ form: formId });
    
    // Delete the form
    await Form.findByIdAndDelete(formId);
    
    // Return success response
    res.json({
      success: true,
      message: 'Form and associated coupons deleted successfully'
    });
  } catch (error) {
    console.error('Delete form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
};

// Upload Excel data for forms
exports.uploadExcelData = async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check if formId is provided
    if (!req.body.formId) {
      // Clean up the uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Form ID is required'
      });
    }

    // Validate form exists
    const form = await Form.findById(req.body.formId);
    if (!form) {
      // Clean up the uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    try {
      const fs = require('fs');
      const xlsx = require('xlsx');
      
      // Read the Excel file
      const workbook = xlsx.readFile(req.file.path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Get all values from column A
      const columnAValues = [];
      let row = 1;
      while (worksheet[`A${row}`]) {
        columnAValues.push(worksheet[`A${row}`].v);
        row++;
      }

      if (columnAValues.length === 0) {
        // Clean up the uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(400).json({
          success: false,
          message: 'Column A is empty'
        });
      }

      // Get form's coupon limit
      const couponLimit = form.coupon_limit || 0; // 0 means unlimited
      
      // Get existing unassigned coupons for this form
      const existingCoupons = await Coupon.find({ 
        form: form._id,
        is_assigned: false 
      });
      
      // Calculate how many new coupons we can add
      const maxNewCoupons = couponLimit > 0 
        ? Math.max(0, couponLimit - existingCoupons.length)
        : columnAValues.length;
      
      if (maxNewCoupons === 0) {
        // Clean up the uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(400).json({
          success: false,
          message: 'Coupon limit reached or no new coupons needed'
        });
      }
      
      // Create new coupons based on available slots
      const newCouponCodes = [];
      const maxCoupons = Math.min(maxNewCoupons, columnAValues.length);
      
      for (let i = 0; i < maxCoupons; i++) {
        const couponCode = columnAValues[i];
        const couponDoc = {
          coupon_code: couponCode,
          form: form._id,
          is_assigned: false
        };
        
        await Coupon.create(couponDoc);
        newCouponCodes.push(couponCode);
      }
      
      // Update the form with all coupon codes (existing + new)
      const allCouponCodes = [
        ...existingCoupons.map(c => c.coupon_code),
        ...newCouponCodes
      ];
      
      form.coupon_codes = allCouponCodes;
      const savedForm = await form.save();
      
      // Clean up the uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Return updated form data
      return res.status(200).json({
        success: true,
        message: `Form updated successfully with ${newCouponCodes.length} new coupon codes`,
        data: {
          formId: savedForm._id,
          slug: savedForm.slug,
          newCouponCodes: newCouponCodes,
          totalCoupons: allCouponCodes.length,
          existingCoupons: existingCoupons.length,
          newCoupons: newCouponCodes.length
        }
      });
      
    } catch (error) {
      console.error('Error processing Excel file:', error);
      
      // Clean up the uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error processing Excel file',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Form Excel upload error:', error);
    
    // Clean up the uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to upload Excel data',
      error: error.message
    });
  }
};

// Get form statistics
exports.getFormStats = async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Find the form
    const form = await Form.findOne({ slug });
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    
    // Get registration count
    const registrationsCount = await Registration.countDocuments({ form: form._id });
    const limitReached = form.coupon_limit > 0 && registrationsCount >= form.coupon_limit;
    const remainingSlots = form.coupon_limit > 0 ? Math.max(0, form.coupon_limit - registrationsCount) : null;
    
    return res.status(200).json({
      success: true,
      formStats: {
        registrationsCount,
        couponLimit: form.coupon_limit,
        limitReached,
        remainingSlots
      }
    });
    
  } catch (error) {
    console.error('Error fetching form stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form stats',
      error: error.message
    });
  }
};