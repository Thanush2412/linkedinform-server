const Coupon = require('../models/Coupon');
const Form = require('../models/Form');
const Registration = require('../models/Registration');
const fs = require('fs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');

// Upload coupons from Excel file
exports.uploadCoupons = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const formId = req.body.formId;
    if (!formId) {
      return res.status(400).json({
        success: false,
        message: 'Form ID is required'
      });
    }

    // Find the form to check its limit
    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Read the Excel file
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Excel file has no data'
      });
    }

    // Get the coupon codes from the Excel file
    // Adjust the column name based on your Excel structure
    const couponCodes = data.map(row => row.coupon_code || row.code || row.coupon).filter(Boolean);

    if (couponCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid coupon codes found in the Excel file'
      });
    }

    // Check if form has a limit set
    if (form.coupon_limit > 0 && couponCodes.length > form.coupon_limit) {
      return res.status(400).json({
        success: false,
        message: `Form has a limit of ${form.coupon_limit} coupons, but you are trying to upload ${couponCodes.length} coupons`
      });
    }

    // Create coupon entries in the database
    const coupons = couponCodes.map(code => ({
      coupon_code: code,
      form: mongoose.Types.ObjectId(formId),
      is_assigned: false
    }));

    // Insert the coupons
    await Coupon.insertMany(coupons);

    // Update the form with the coupon codes
    form.coupon_codes = [...(form.coupon_codes || []), ...couponCodes];
    await form.save();

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${couponCodes.length} coupon codes`,
      count: couponCodes.length
    });
  } catch (error) {
    console.error('Error uploading coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload coupon codes',
      error: error.message
    });
  }
};

// Assign a coupon to a registration (not directly used in frontend)
exports.assignCoupon = async (req, res) => {
  try {
    const { formId, registrationId, email } = req.body;
    
    if (!formId) {
      return res.status(400).json({
        success: false,
        message: 'Form ID is required'
      });
    }
    
    // Find the form
    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    
    // Check if there are any available coupons for this form
    const availableCoupon = await Coupon.findOne({
      form: mongoose.Types.ObjectId(formId),
      is_assigned: false
    });
    
    if (!availableCoupon) {
      return res.status(404).json({
        success: false,
        message: 'No available coupons for this form'
      });
    }
    
    // Mark the coupon as assigned
    availableCoupon.is_assigned = true;
    availableCoupon.assigned_to = email;
    availableCoupon.assigned_at = new Date();
    
    await availableCoupon.save();
    
    return res.status(200).json({
      success: true,
      message: 'Coupon assigned successfully',
      couponCode: availableCoupon.coupon_code
    });
  } catch (error) {
    console.error('Error assigning coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign coupon',
      error: error.message
    });
  }
};

// Get available coupons count for a form
exports.getAvailableCouponsCount = async (req, res) => {
  try {
    const { formId } = req.params;
    
    if (!formId) {
      return res.status(400).json({
        success: false,
        message: 'Form ID is required'
      });
    }
    
    // Count available coupons
    const count = await Coupon.countDocuments({
      form: mongoose.Types.ObjectId(formId),
      is_assigned: false
    });
    
    return res.status(200).json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error getting available coupons count:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get available coupons count',
      error: error.message
    });
  }
}; 