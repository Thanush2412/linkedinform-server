const CouponUpload = require('../models/CouponUpload');
const Coupon = require('../models/Coupon');
const fs = require('fs');
const path = require('path');

// Get all coupon uploads
exports.getCouponUploads = async (req, res) => {
  try {
    const uploads = await CouponUpload.find()
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email')
      .populate('formId', 'title college');
    
    res.status(200).json({
      success: true,
      data: uploads
    });
  } catch (error) {
    console.error('Error fetching coupon uploads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon uploads',
      error: error.message
    });
  }
};

// Get a single upload by ID
exports.getCouponUploadById = async (req, res) => {
  try {
    const upload = await CouponUpload.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('formId', 'title college')
      .populate('coupons');
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Coupon upload not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: upload
    });
  } catch (error) {
    console.error('Error fetching coupon upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon upload',
      error: error.message
    });
  }
};

// Create a coupon upload record
exports.createCouponUpload = async (req, res) => {
  try {
    const { fileName, originalName, mimeType, fileSize, formId, couponsAdded, duplicatesSkipped, errors, coupons } = req.body;
    
    const uploadData = {
      fileName,
      originalName,
      mimeType,
      fileSize,
      uploadedBy: req.user.id,
      couponsAdded,
      duplicatesSkipped,
      errors: errors || [],
      formId,
      coupons: coupons || []
    };
    
    const upload = await CouponUpload.create(uploadData);
    
    res.status(201).json({
      success: true,
      data: upload
    });
  } catch (error) {
    console.error('Error creating coupon upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating coupon upload',
      error: error.message
    });
  }
};

// Delete a coupon upload (only the record, not the coupons)
exports.deleteCouponUpload = async (req, res) => {
  try {
    const upload = await CouponUpload.findById(req.params.id);
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Coupon upload not found'
      });
    }
    
    await CouponUpload.deleteOne({ _id: req.params.id });
    
    res.status(200).json({
      success: true,
      message: 'Coupon upload deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting coupon upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting coupon upload',
      error: error.message
    });
  }
};

// Get coupon uploads statistics
exports.getCouponUploadsStats = async (req, res) => {
  try {
    const totalUploads = await CouponUpload.countDocuments();
    const totalCouponsAdded = await CouponUpload.aggregate([
      { $group: { _id: null, total: { $sum: '$couponsAdded' } } }
    ]);
    
    const uploadsByForm = await CouponUpload.aggregate([
      { $group: { _id: '$formId', count: { $sum: 1 }, coupons: { $sum: '$couponsAdded' } } },
      { $lookup: { from: 'forms', localField: '_id', foreignField: '_id', as: 'form' } },
      { $unwind: { path: '$form', preserveNullAndEmptyArrays: true } },
      { $project: { formId: '$_id', formTitle: '$form.title', count: 1, coupons: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        totalUploads,
        totalCouponsAdded: totalCouponsAdded.length > 0 ? totalCouponsAdded[0].total : 0,
        uploadsByForm
      }
    });
  } catch (error) {
    console.error('Error fetching coupon uploads stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon uploads stats',
      error: error.message
    });
  }
}; 