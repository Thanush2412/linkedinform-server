const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const CouponUpload = require('../models/CouponUpload');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const xlsx = require('xlsx');
const Form = require('../models/Form');
const exceljs = require('exceljs');

// Helper to process coupon data
const processCouponData = async (coupons, userId, formId = null) => {
  const results = {
    added: 0,
    errors: [],
    duplicates: 0,
    processed: []
  };

  // Normalize the coupons data
  const normalizedCoupons = coupons.map(coupon => {
    // If it's a string, convert it to an object with a code property
    if (typeof coupon === 'string') {
      return { code: coupon.trim().toUpperCase() };
    }
    
    // If it's an object but doesn't have a code property
    if (typeof coupon === 'object' && !coupon.code) {
      // Try to find a property that might contain the code
      const possibleCodeKeys = ['code', 'coupon', 'couponcode', 'coupon_code', 'Code', 'Coupon', 'CouponCode'];
      let codeKey = null;
      
      for (const key of Object.keys(coupon)) {
        if (possibleCodeKeys.includes(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          codeKey = key;
          break;
        }
      }
      
      // If code key found, use it but preserve all other properties
      if (codeKey) {
        return { 
          ...coupon, 
          code: coupon[codeKey].toString().trim().toUpperCase() 
        };
      }
      
      // If no code property found, use the first property value as the code but preserve others
      if (Object.keys(coupon).length > 0) {
        const firstKey = Object.keys(coupon)[0];
        return { 
          ...coupon, 
          code: coupon[firstKey].toString().trim().toUpperCase() 
        };
      }
    }
    
    // If it already has a code property, ensure it's uppercase but preserve all other properties
    if (coupon.code) {
      return { 
        ...coupon, 
        code: coupon.code.toString().trim().toUpperCase() 
      };
    }
    
    return coupon;
  }).filter(coupon => coupon && coupon.code && coupon.code.length > 0);

  for (const couponData of normalizedCoupons) {
    try {
      // Check if coupon already exists
      const existingCoupon = await Coupon.findOne({ code: couponData.code });
      if (existingCoupon) {
        results.duplicates++;
        continue;
      }

      // Prepare coupon data with all fields from the Excel/CSV
      const couponToCreate = {
        code: couponData.code,
        description: couponData.description || `Coupon ${couponData.code}`,
        discount: parseFloat(couponData.discount || 0),
        isPercentage: couponData.isPercentage === undefined ? true : (couponData.isPercentage === 'true' || couponData.isPercentage === true),
        maxUses: couponData.maxUses ? parseInt(couponData.maxUses) : 1,
        isActive: couponData.isActive === undefined ? true : (couponData.isActive === 'true' || couponData.isActive === true),
        expiryDate: couponData.expiryDate ? new Date(couponData.expiryDate) : null,
        createdBy: userId,
        formId: couponData.formId || formId  // Make formId optional and default to null
      };
      
      // Add any additional fields from the Excel/CSV that aren't in our standard model
      // Store them in a metadata field
      const metadata = {};
      for (const key in couponData) {
        if (!['code', 'description', 'discount', 'isPercentage', 'maxUses', 'isActive', 'expiryDate', 'formId'].includes(key)) {
          metadata[key] = couponData[key];
        }
      }
      
      // Only add metadata if there are additional fields
      if (Object.keys(metadata).length > 0) {
        couponToCreate.metadata = metadata;
      }
      
      // Create new coupon with all available data
      const newCoupon = await Coupon.create(couponToCreate);
      
      results.processed.push(newCoupon);
      results.added++;
    } catch (error) {
      results.errors.push(`Error processing coupon ${JSON.stringify(couponData)}: ${error.message}`);
    }
  }

  return results;
};

// Upload coupons from a file
exports.uploadCoupons = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    const formId = req.body.formId; // Optional form ID to link coupons to
    const isGoogleForm = req.body.isGoogleForm === 'true'; // Check if this is a Google Form response
    
    // Process file content based on file type
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const fileName = req.file.originalname.toLowerCase();
    
    let coupons = [];
    let errorMessage = '';
    
    try {
      if (fileExt === '.xlsx' || fileExt === '.xls') {
    // Process Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
        
        // Check if this is likely a Google Form response
        const isGFormResponse = fileName.includes('form response') || isGoogleForm;
        
        if (isGFormResponse && data.length > 1) {
          // Google Forms typically have headers in the first row
          // Look for columns that might contain the coupon code
          const headerRow = data[0];
          
          // Find the index of columns that might contain coupon codes
          const possibleCodeColumns = ['code', 'coupon', 'coupon code', 'linkedin', 'premium'];
          let codeColumnIndex = -1;
          
          for (let i = 0; i < headerRow.length; i++) {
            const header = (headerRow[i] || '').toString().toLowerCase();
            if (possibleCodeColumns.some(col => header.includes(col))) {
              codeColumnIndex = i;
              break;
            }
          }
          
          // If we found a likely coupon column, extract those values
          if (codeColumnIndex !== -1) {
            // Start from row 1 (skipping header)
            for (let i = 1; i < data.length; i++) {
              if (data[i] && data[i][codeColumnIndex]) {
                const code = data[i][codeColumnIndex].toString().trim();
                if (code) coupons.push(code);
              }
            }
                } else {
            // If we can't find a specific coupon column, try the first column with non-empty data
            for (let i = 1; i < data.length; i++) {
              // Find the first non-empty cell in this row
              if (data[i]) {
                for (let j = 0; j < data[i].length; j++) {
                  if (data[i][j]) {
                    const code = data[i][j].toString().trim();
                    if (code) {
                      coupons.push(code);
                      break; // Only take the first non-empty cell
                    }
                  }
                }
              }
            }
          }
        } else {
          // Standard Excel handling (non-Google Form)
          // Extract coupon codes from first column
          for (let i = 0; i < data.length; i++) {
            if (data[i] && data[i][0]) {
              const code = data[i][0].toString().trim();
              if (code) coupons.push(code);
            }
          }
        }
      } else if (fileExt === '.csv' || fileExt === '.txt') {
        // Process CSV or text file
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check if this is likely a Google Form response
        const isGFormResponse = fileName.includes('form response') || isGoogleForm;
        
        if (isGFormResponse) {
          // Google Form CSVs typically have headers and a more complex structure
          // First, try to handle it by parsing it properly
          const lines = content.split(/\r?\n/).filter(line => line.trim());
          
          if (lines.length > 1) {
            // First line is likely headers
            const headers = lines[0].split(',').map(h => h.toLowerCase().trim());
            
            // Find columns that might contain the coupon code
            const possibleCodeColumns = ['code', 'coupon', 'coupon code', 'linkedin', 'premium'];
            let codeColumnIndex = -1;
            
            for (let i = 0; i < headers.length; i++) {
              if (possibleCodeColumns.some(col => headers[i].includes(col))) {
                codeColumnIndex = i;
                break;
              }
            }
            
            // If we found a likely coupon column, extract those values
            if (codeColumnIndex !== -1) {
              // Start from line 1 (skipping header)
              for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split(',');
                if (columns[codeColumnIndex]) {
                  const code = columns[codeColumnIndex].replace(/["']/g, '').trim();
                  if (code) coupons.push(code);
                }
              }
            } else {
              // If we can't find a specific column, try to get all non-empty values from each line
              for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split(',');
                // Take the first non-empty value
                for (let j = 0; j < columns.length; j++) {
                  const code = columns[j].replace(/["']/g, '').trim();
                  if (code) {
                    coupons.push(code);
                    break; // Only take the first non-empty value per line
                  }
                }
              }
            }
          }
        } else {
          // Standard CSV/TXT handling (one code per line)
          coupons = content.split(/[\r\n,]+/)
            .map(code => code.replace(/["']/g, '').trim().toUpperCase())
            .filter(Boolean);
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Unsupported file format. Please upload .xlsx, .xls, .csv, or .txt file.'
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      errorMessage = error.message;
      
      // If error occurred but file is valid, try a more basic approach
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Brute force: extract any word character sequences as potential codes
        const matches = content.match(/\b\w+\b/g);
        if (matches && matches.length > 0) {
          coupons = matches
            .map(code => code.trim().toUpperCase())
            .filter(code => code.length >= 4); // Only consider codes with at least 4 characters
        }
      }
    } finally {
      // Clean up the uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    if (coupons.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid coupon codes found in the file. ' + 
                 (errorMessage ? `Error: ${errorMessage}` : 'Please check file format.')
      });
    }
    
    // Check for duplicates
    const uniqueCoupons = [...new Set(coupons)];
    const duplicates = coupons.length - uniqueCoupons.length;
    
    // Check for existing coupons in the database
    const existingCoupons = await Coupon.find({ code: { $in: uniqueCoupons } });
    const existingCodes = existingCoupons.map(c => c.code);
    const newCoupons = uniqueCoupons.filter(code => !existingCodes.includes(code));
    
    // Create coupon upload record
    const uploadRecord = new CouponUpload({
      fileName: req.file.originalname,
      originalName: req.file.originalname,
      uploadDate: new Date(),
      uploadedBy: req.user._id,
      formId: formId || null,
      couponsAdded: newCoupons.length,
      couponsUsed: 0
    });
    
    const savedUpload = await uploadRecord.save();
    
    // Get form deactivation date if form ID is provided
    let expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
    if (formId) {
      const form = await Form.findById(formId);
      if (form && form.deactivation) {
        expiryDate = form.deactivation;
      }
    }
    
    // Create coupon documents with reference to the upload
    if (newCoupons.length > 0) {
      const couponDocs = newCoupons.map(code => ({
        code,
        maxUses: 1,
        isActive: true,
        formId: formId || null,
        uploadId: savedUpload._id,
        expiryDate: expiryDate,
        createdAt: new Date()
      }));
      
      await Coupon.insertMany(couponDocs);
    }

    return res.status(200).json({
      success: true,
      message: 'Coupons uploaded successfully',
      added: newCoupons.length,
      duplicates: duplicates + existingCodes.length,
      total: coupons.length,
      errors: coupons.length === 0 ? ['No valid coupon codes found in the file'] : [],
      uploadId: savedUpload._id, // Return the upload ID to enable automatic viewing
      coupons: newCoupons // Return the list of coupon codes for immediate display
    });
  } catch (error) {
    console.error('Error uploading coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Error uploading coupons',
      error: error.message
    });
  }
};

// Get all coupons
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupons', error: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByIdAndDelete(id);
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    res.status(200).json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ success: false, message: 'Error deleting coupon', error: error.message });
  }
};

// Update coupon status
exports.updateCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const coupon = await Coupon.findByIdAndUpdate(
      id, 
      { isActive }, 
      { new: true }
    );
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `Coupon ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: coupon
    });
  } catch (error) {
    console.error('Error updating coupon status:', error);
    res.status(500).json({ success: false, message: 'Error updating coupon status', error: error.message });
  }
};

// Validate coupon code
exports.validateCoupon = async (req, res) => {
  try {
    const { code, formId } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    
    // Find coupon by code (case insensitive)
    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      isActive: true
    });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid coupon code or coupon is inactive' });
    }
    
    // Check if coupon is expired
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }
    
    // Check if coupon has reached maximum uses
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'Coupon has reached maximum usage limit' });
    }
    
    // Check if coupon is restricted to a specific form
    if (coupon.formId && formId && coupon.formId.toString() !== formId.toString()) {
      return res.status(400).json({ success: false, message: 'Coupon is not valid for this form' });
    }
    
    // Return coupon details
    res.status(200).json({
      success: true,
      message: 'Coupon is valid',
      data: {
        couponId: coupon._id,
        code: coupon.code,
        discount: coupon.discount,
        isPercentage: coupon.isPercentage,
        description: coupon.description
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ success: false, message: 'Error validating coupon', error: error.message });
  }
};

// Apply coupon to registration
exports.applyCoupon = async (req, res) => {
  try {
    const { 
      couponId, 
      registrationId, 
      discountApplied,
      employeeNumber,
      userDetails,
      formDetails
    } = req.body;
    
    if (!couponId || !registrationId) {
      return res.status(400).json({ success: false, message: 'Coupon ID and Registration ID are required' });
    }
    
    // Find coupon
    const coupon = await Coupon.findById(couponId);
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    // Check if coupon is active
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: 'Coupon is inactive' });
    }
    
    // Check if coupon is expired
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }
    
    // Check if coupon has reached maximum uses
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'Coupon has reached maximum usage limit' });
    }
    
    // Check if this registration has already used this coupon
    const alreadyUsed = coupon.usedBy.some(usage => 
      usage.registrationId.toString() === registrationId.toString()
    );
    
    if (alreadyUsed) {
      return res.status(400).json({ success: false, message: 'This registration has already used this coupon' });
    }
    
    // Update coupon usage with detailed tracking information
    coupon.usedCount += 1;
    coupon.usedBy.push({
      registrationId,
      usedAt: new Date(),
      discountApplied,
      employeeNumber,
      userDetails,
      formDetails
    });
    
    await coupon.save();
    
    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Error applying coupon', error: error.message });
  }
};

// Format LinkedIn coupon URL
const formatLinkedInCouponUrl = (couponCode) => {
  // Remove any "THANKS-" prefix if it exists
  const cleanCode = couponCode.replace(/^THANKS-/i, '');
  return `http://www.linkedin.com/premium/redeem/gift?_ed=${cleanCode}&mcid=7185883047605547008`;
};

// Get a coupon's LinkedIn URL
exports.getLinkedInCouponUrl = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }
    
    // Check if the coupon exists
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // Track the view event (optional)
    if (req.query.track === 'true') {
      const copyEvent = {
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        source: req.query.source || 'url_view',
        formId: req.query.formId || null
      };
      
      coupon.copyEvents.unshift(copyEvent);
      await coupon.save();
    }
    
    return res.status(200).json({
      success: true,
      url: formatLinkedInCouponUrl(coupon.code),
      code: coupon.code
    });
  } catch (error) {
    console.error('Error getting LinkedIn coupon URL:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while getting LinkedIn coupon URL'
    });
  }
};

// Track when a coupon code is copied
exports.trackCouponCopy = async (req, res) => {
  try {
    const { 
      couponCode, 
      formId,
      formSlug,
      formName, 
      linkedInUrl, 
      source, 
      viewTime, 
      registrationTime, 
      formData, 
      fromSuccessBanner
    } = req.body;
    
    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }
    
    // Find the coupon by code
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Create the copy event
    const copyEvent = {
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      source: source || 'manual',
      // Only use formId if it's a valid MongoDB ObjectId
      // If formSlug is provided, store it as a string property
      formSlug: formSlug || null,
      // Add additional tracking fields
      formName: formName || null,
      linkedInUrl: linkedInUrl || formatLinkedInCouponUrl(coupon.code),
      fromSuccessBanner: fromSuccessBanner || false
    };
    
    // Add view time if provided (for tracking when the URL was first seen)
    if (viewTime) {
      copyEvent.viewTime = new Date(viewTime);
    }

    // Add registration time if provided
    if (registrationTime) {
      copyEvent.registrationTime = new Date(registrationTime);
    }

    // Add form data if provided
    if (formData) {
      copyEvent.formData = formData;
    }

    // Add to beginning of array (most recent first)
    coupon.copyEvents.unshift(copyEvent);
    await coupon.save();

    return res.status(200).json({
      success: true, 
      message: 'Coupon copy event tracked',
      linkedInUrl: linkedInUrl || formatLinkedInCouponUrl(coupon.code)
    });
  } catch (error) {
    console.error('Error tracking coupon copy:', error);
    return res.status(500).json({
      success: false, 
      message: 'Server error while tracking coupon copy'
    });
  }
};

// Track bulk coupon copy operations
exports.trackBulkCopy = async (req, res) => {
  try {
    const { 
      count, 
      operation, 
      formId, 
      formName, 
      viewTime, 
      source, 
      couponIds,
      includesLinkedInUrls 
    } = req.body;
    
    if (!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Coupon IDs are required'
      });
    }

    // Process each coupon in the bulk operation
    const results = await Promise.all(couponIds.map(async (couponId) => {
      try {
        // Find the coupon by ID
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
          return { 
            success: false, 
            couponId, 
            message: 'Coupon not found' 
          };
        }

        // Create the copy event
        const copyEvent = {
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          source: source || 'bulk_copy',
          formName: formName || null,
          // Add LinkedIn URL information if this was a URL copy operation
          linkedInUrl: includesLinkedInUrls ? formatLinkedInCouponUrl(coupon.code) : null,
          bulkOperation: {
            operation: operation || 'copy',
            totalCopied: count
          }
        };
        
        // Add view time if provided
        if (viewTime) {
          copyEvent.viewTime = new Date(viewTime);
        }

        // Add to beginning of array (most recent first)
        coupon.copyEvents.unshift(copyEvent);
        await coupon.save();
        
        return { 
          success: true, 
          couponId, 
          message: 'Copy event tracked' 
        };
      } catch (err) {
        console.error(`Error tracking copy for coupon ${couponId}:`, err);
        return { 
          success: false, 
          couponId, 
          message: err.message 
        };
      }
    }));
    
    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      message: `Bulk copy tracked for ${successes} coupons (${failures} failed)`,
      details: results,
      operation: operation || 'copy',
      totalCopied: count
    });
  } catch (error) {
    console.error('Error tracking bulk copy:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while tracking bulk copy'
    });
  }
};

// Get all coupons
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate('formId', 'name')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single coupon
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('formId', 'name')
      .populate('createdBy', 'name email')
      .populate('usedBy.registrationId', 'name email');

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.status(200).json(coupon);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get coupon usage statistics
exports.getCouponStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id)
      .populate({
        path: 'usedBy.registrationId',
        select: 'name email phone formId createdAt'
      })
      .populate({
        path: 'usedBy.formDetails.formId',
        select: 'college'
      })
      .populate({
        path: 'formId',
        select: 'college'
      });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    // Format usage details for better readability
    const usageDetails = coupon.usedBy.map(usage => {
      const registration = usage.registrationId;
      return {
        usedAt: usage.usedAt,
        discountApplied: usage.discountApplied,
        employeeNumber: usage.employeeNumber || (registration ? registration.employeeNumber : null),
        userDetails: usage.userDetails || (registration ? {
          name: registration.name,
          email: registration.email,
          phone: registration.phone
        } : null),
        formDetails: usage.formDetails || (registration && registration.formId ? {
          formId: registration.formId,
          college: registration.formName
        } : null)
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        totalUses: coupon.usedCount,
        maxUses: coupon.maxUses,
        usageDetails,
        copyEvents: coupon.copyEvents || [],
        formRestriction: coupon.formId ? {
          formId: coupon.formId._id,
          college: coupon.formId.college
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching coupon stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupon stats', error: error.message });
  }
};

// Get detailed coupon statistics with complete history for download
exports.getCouponExportData = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    const coupon = await Coupon.findById(id)
      .populate({
        path: 'usedBy.registrationId',
        select: 'name email phone formId createdAt yop college register_number employee_number'
      })
      .populate({
        path: 'usedBy.formDetails.formId',
        select: 'college slug'
      })
      .populate({
        path: 'formId',
        select: 'college slug'
      });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    // Format usage details for export
    const usageData = coupon.usedBy.map(usage => {
      const registration = usage.registrationId;
      return {
        couponCode: coupon.code,
        usedAt: usage.usedAt ? new Date(usage.usedAt).toISOString() : null,
        employeeNumber: usage.employeeNumber || (registration ? registration.employee_number : null),
        userName: usage.userDetails?.name || (registration ? registration.name : null),
        userEmail: usage.userDetails?.email || (registration ? registration.email : null),
        userPhone: usage.userDetails?.phone || (registration ? registration.phone : null),
        formName: usage.formDetails?.college || (registration && registration.formId ? registration.formName : null),
        formSlug: registration?.formId?.slug || null,
        college: registration?.college || null,
        registerNumber: registration?.register_number || null,
        yearOfPassing: registration?.yop || null,
        discountApplied: usage.discountApplied || coupon.discount
      };
    });
    
    // Format copy events for export
    const copyData = coupon.copyEvents.map(event => {
      return {
        couponCode: coupon.code,
        copiedAt: event.timestamp ? new Date(event.timestamp).toISOString() : null,
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        formId: event.formId ? event.formId.toString() : null
      };
    });
    
    // Combine all data for export
    const exportData = {
      couponDetails: {
        code: coupon.code,
        discount: coupon.discount,
        isPercentage: coupon.isPercentage,
        maxUses: coupon.maxUses,
        usedCount: coupon.usedCount,
        isActive: coupon.isActive,
        expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate).toISOString().split('T')[0] : '',
        formId: coupon.formId ? coupon.formId._id : null,
        formName: coupon.formId ? coupon.formId.college : null
      },
      usageHistory: usageData,
      copyEvents: copyData
    };
    
    // Return data in requested format
    if (format === 'csv') {
      // Convert to CSV
      const { Parser } = require('json2csv');
      
      // Prepare fields for usage history
      const usageFields = [
        { label: 'Coupon Code', value: 'couponCode' },
        { label: 'Used At', value: 'usedAt' },
        { label: 'Employee Number', value: 'employeeNumber' },
        { label: 'User Name', value: 'userName' },
        { label: 'User Email', value: 'userEmail' },
        { label: 'User Phone', value: 'userPhone' },
        { label: 'Form Name', value: 'formName' },
        { label: 'Form Slug', value: 'formSlug' },
        { label: 'College', value: 'college' },
        { label: 'Register Number', value: 'registerNumber' },
        { label: 'Year of Passing', value: 'yearOfPassing' },
        { label: 'Discount Applied', value: 'discountApplied' }
      ];
      
      // Prepare fields for copy events
      const copyFields = [
        { label: 'Coupon Code', value: 'couponCode' },
        { label: 'Copied At', value: 'copiedAt' },
        { label: 'IP Address', value: 'ipAddress' },
        { label: 'User Agent', value: 'userAgent' },
        { label: 'Form ID', value: 'formId' }
      ];
      
      try {
        // Generate CSV for usage history
        const usageParser = new Parser({ fields: usageFields });
        const usageCsv = usageData.length > 0 ? usageParser.parse(usageData) : 'No usage data available';
        
        // Generate CSV for copy events
        const copyParser = new Parser({ fields: copyFields });
        const copyCsv = copyData.length > 0 ? copyParser.parse(copyData) : 'No copy events available';
        
        // Combine both CSVs with headers
        const combinedCsv = `COUPON: ${coupon.code}\n\nUSAGE HISTORY:\n${usageCsv}\n\nCOPY EVENTS:\n${copyCsv}`;
        
        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="coupon_${coupon.code}_history.csv"`);
        return res.send(combinedCsv);
      } catch (csvError) {
        console.error('Error generating CSV:', csvError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error generating CSV file', 
          error: csvError.message 
        });
      }
    } else if (format === 'excel') {
      // Convert to Excel
      const XLSX = require('xlsx');
      
      try {
        // Create workbook and worksheets
        const wb = XLSX.utils.book_new();
        
        // Add coupon details worksheet
        const detailsWS = XLSX.utils.json_to_sheet([exportData.couponDetails]);
        XLSX.utils.book_append_sheet(wb, detailsWS, 'Coupon Details');
        
        // Add usage history worksheet
        const usageWS = XLSX.utils.json_to_sheet(usageData);
        XLSX.utils.book_append_sheet(wb, usageWS, 'Usage History');
        
        // Add copy events worksheet
        const copyWS = XLSX.utils.json_to_sheet(copyData);
        XLSX.utils.book_append_sheet(wb, copyWS, 'Copy Events');
        
        // Write to buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Set headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="coupon_${coupon.code}_history.xlsx"`);
        return res.send(buffer);
      } catch (excelError) {
        console.error('Error generating Excel file:', excelError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error generating Excel file', 
          error: excelError.message 
        });
      }
    } else {
      // Return JSON by default
      return res.status(200).json({
        success: true,
        data: exportData
      });
    }
  } catch (error) {
    console.error('Error exporting coupon data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error exporting coupon data', 
      error: error.message 
    });
  }
};

// Export all coupons with filtering and metadata
exports.exportAllCoupons = async (req, res) => {
  try {
    const { search, formId, status, usageStatus, includeMetadata } = req.query;
    
    // Build filter query
    const filter = { createdBy: req.user.id };
    
    if (search) {
      filter.code = { $regex: search, $options: 'i' };
    }
    
    if (formId) {
      filter.formId = formId;
    }
    
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    // Get all coupons matching the filter
    let coupons = await Coupon.find(filter)
      .populate('formId', 'college slug')
      .sort({ createdAt: -1 });
    
    // Apply usage status filter (this can't be done in the DB query easily)
    if (usageStatus === 'used') {
      coupons = coupons.filter(coupon => coupon.usedCount > 0);
    } else if (usageStatus === 'unused') {
      coupons = coupons.filter(coupon => coupon.usedCount === 0);
    } else if (usageStatus === 'partial') {
      coupons = coupons.filter(coupon => coupon.usedCount > 0 && coupon.usedCount < coupon.maxUses);
    }
    
    // Transform coupons for export
    const exportData = coupons.map(coupon => {
      const formattedCoupon = {
        code: coupon.code,
        description: coupon.description,
        discount: coupon.discount,
        isPercentage: coupon.isPercentage ? 'Yes' : 'No',
        maxUses: coupon.maxUses,
        usedCount: coupon.usedCount,
        isActive: coupon.isActive ? 'Active' : 'Inactive',
        expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate).toISOString().split('T')[0] : '',
        formName: coupon.formId ? coupon.formId.college : 'No Form',
        formId: coupon.formId ? coupon.formId._id : '',
        lastUsed: coupon.usedBy && coupon.usedBy.length > 0 
          ? new Date(coupon.usedBy[0].usedAt).toLocaleString() 
          : 'Never Used',
        copyCount: coupon.copyEvents ? coupon.copyEvents.length : 0,
        lastCopied: coupon.copyEvents && coupon.copyEvents.length > 0 
          ? new Date(coupon.copyEvents[0].timestamp).toLocaleString() 
          : 'Never Copied',
        createdAt: new Date(coupon.createdAt).toLocaleString()
      };
      
      // Include metadata if requested
      if (includeMetadata === 'true' && coupon.metadata) {
        Object.keys(coupon.metadata).forEach(key => {
          // Don't overwrite existing fields
          if (!formattedCoupon[key]) {
            formattedCoupon[key] = coupon.metadata[key];
          }
        });
      }
      
      return formattedCoupon;
    });
    
    // Determine format from request
    const format = req.query.format || 'excel';
    
    if (format === 'json') {
      return res.json(exportData);
    } else if (format === 'csv') {
      const json2csv = require('json2csv').parse;
      const csv = json2csv(exportData);
      res.header('Content-Type', 'text/csv');
      res.attachment('coupon_export.csv');
      return res.send(csv);
    } else {
      // Default to Excel
      const xlsx = require('xlsx');
      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Coupons');
      
      // Set column widths
      const colWidths = [
        { wch: 15 }, // code
        { wch: 20 }, // description
        { wch: 10 }, // discount
        { wch: 10 }, // isPercentage
        { wch: 10 }, // maxUses
        { wch: 10 }, // usedCount
        { wch: 10 }, // isActive
        { wch: 12 }, // expiryDate
        { wch: 25 }, // formName
        { wch: 25 }, // formId
        { wch: 20 }, // lastUsed
        { wch: 10 }, // copyCount
        { wch: 20 }, // lastCopied
        { wch: 20 }  // createdAt
      ];
      ws['!cols'] = colWidths;
      
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('coupon_export.xlsx');
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Error exporting coupons:', error);
    return res.status(500).json({ success: false, message: 'Error exporting coupons' });
  }
};

// Get all coupon uploads
exports.getCouponUploads = async (req, res) => {
  try {
    // Get coupon uploads with basic information
    const uploads = await CouponUpload.find()
      .populate('uploadedBy', 'name email')
      .sort({ uploadDate: -1 });
    
    // Return uploads with coupon counts
    const uploadsWithStats = await Promise.all(uploads.map(async (upload) => {
      const uploadObj = upload.toObject();
      uploadObj.couponsUsed = await Coupon.countDocuments({ 
        uploadId: upload._id,
        usedCount: { $gt: 0 } 
      });
      return uploadObj;
    }));
    
    return res.status(200).json({
      success: true,
      data: uploadsWithStats
    });
  } catch (error) {
    console.error('Error getting coupon uploads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coupon uploads',
      error: error.message
    });
  }
};

// Get coupon upload details with all coupons
exports.getCouponUploadDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the upload
    const upload = await CouponUpload.findById(id)
      .populate('uploadedBy', 'name email');
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Coupon upload not found'
      });
    }
    
    // Get all coupons from this upload
    const coupons = await Coupon.find({ uploadId: id });
    
    // Count used coupons
    const usedCount = coupons.filter(coupon => coupon.usedCount > 0).length;
    
    // Add used count to upload
    const uploadWithStats = {
      ...upload.toObject(),
      couponsUsed: usedCount
    };
    
    return res.status(200).json({
      success: true,
      upload: uploadWithStats,
      coupons
    });
  } catch (error) {
    console.error('Error getting coupon upload details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coupon upload details',
      error: error.message
    });
  }
};

// Download coupon file by upload ID
exports.downloadCouponFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeLinkedInUrls } = req.query;
    
    // Verify upload exists and belongs to user's organization
    const upload = await CouponUpload.findById(id);
    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Coupon upload not found'
      });
    }
    
    // Find all coupons associated with this upload
    const coupons = await Coupon.find({ uploadId: id });
    
    // Create workbook and worksheet
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Coupons');
    
    // Define columns
    const columns = [
      { header: 'Coupon Code', key: 'code', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Used', key: 'used', width: 10 }
    ];
    
    // Add LinkedIn URL column if requested
    if (includeLinkedInUrls === 'true') {
      columns.push({ header: 'LinkedIn Premium URL', key: 'linkedInUrl', width: 70 });
    }
    
    // Set the columns
    worksheet.columns = columns;
    
    // Add rows for each coupon
    coupons.forEach(coupon => {
      const row = {
        code: coupon.code,
        status: coupon.isActive ? 'Active' : 'Inactive',
        used: coupon.usedCount > 0 ? 'Yes' : 'No'
      };
      
      // Add LinkedIn URL if requested
      if (includeLinkedInUrls === 'true') {
        row.linkedInUrl = formatLinkedInCouponUrl(coupon.code);
      }
      
      worksheet.addRow(row);
    });
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Auto-filter and freeze top row
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: includeLinkedInUrls === 'true' ? 4 : 3 }
    };
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];
    
    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=coupons-${id}.xlsx`);
    
    // Write to response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error downloading coupon file:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating coupon download'
    });
  }
};

// Delete a coupon upload and associated coupons
exports.deleteCouponUpload = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    const unusedOnly = req.query.unusedOnly === 'true';
    
    // First check if the upload exists
    const upload = await CouponUpload.findById(id);
    if (!upload) {
      return res.status(404).json({ success: false, message: 'Coupon upload not found' });
    }
    
    // Check if any coupons from this upload have been used
    const usedCoupons = await Coupon.countDocuments({ 
      uploadId: id,
      usedCount: { $gt: 0 }
    });
    
    // If there are used coupons and we're not forcing or only deleting unused
    if (usedCoupons > 0 && !force && !unusedOnly) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete upload as ${usedCoupons} coupons have already been used.`
      });
    }
    
    // If unusedOnly is set, delete only unused coupons
    if (unusedOnly) {
      // Delete only the unused coupons
      await Coupon.deleteMany({ 
        uploadId: id,
        usedCount: 0 
      });
      
      // Don't delete the upload record, just update the count
      const remainingCoupons = await Coupon.countDocuments({ uploadId: id });
      
      return res.status(200).json({
        success: true,
        message: `Successfully deleted all unused coupons. ${remainingCoupons} used coupons remain.`
      });
    } else {
      // Force delete all coupons or regular delete when no used coupons
      await Coupon.deleteMany({ uploadId: id });
      
      // Delete the upload record
      await CouponUpload.findByIdAndDelete(id);
      
      return res.status(200).json({
        success: true,
        message: 'Coupon upload and associated coupons deleted successfully'
      });
    }
  } catch (error) {
    console.error('Error deleting coupon upload:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting coupon upload',
      error: error.message
    });
  }
};

// Update coupon upload count after individual coupon deletion
exports.updateCouponUploadCount = async (req, res) => {
  try {
    const { id } = req.params;
    const { count } = req.body;
    
    if (!id) {
      return res.status(400).json({ success: false, message: 'Upload ID is required' });
    }
    
    // Find the upload record
    const upload = await CouponUpload.findById(id);
    
    if (!upload) {
      return res.status(404).json({ success: false, message: 'Coupon upload not found' });
    }
    
    // Calculate new count (ensure it doesn't go below 0)
    const newCount = Math.max(0, upload.couponsAdded + (count || -1));
    
    // Update the upload record
    await CouponUpload.findByIdAndUpdate(id, { couponsAdded: newCount });
    
    return res.status(200).json({
      success: true,
      message: 'Coupon count updated successfully',
      newCount
    });
  } catch (error) {
    console.error('Error updating coupon count:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating coupon count',
      error: error.message
    });
  }
};

// Get all coupons with filters
exports.getAllCoupons = async (req, res) => {
  try {
    const { search, formId, status, usageStatus, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build filter query
    const filter = {};
    
    if (search) {
      filter.code = { $regex: search, $options: 'i' };
    }
    
    if (formId) {
      filter.formId = formId;
    }
    
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    // Get all coupons matching the filter
    let coupons = await Coupon.find(filter)
      .populate('formId', 'title college slug')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });
    
    // Apply usage status filter (this can't be done in the DB query easily)
    if (usageStatus === 'used') {
      coupons = coupons.filter(coupon => coupon.usedCount > 0);
    } else if (usageStatus === 'unused') {
      coupons = coupons.filter(coupon => coupon.usedCount === 0);
    } else if (usageStatus === 'partial') {
      coupons = coupons.filter(coupon => coupon.usedCount > 0 && coupon.usedCount < coupon.maxUses);
    }
    
    return res.status(200).json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Error getting coupons:', error);
    return res.status(500).json({ success: false, message: 'Error getting coupons' });
  }
};

// Upload pre-defined LinkedIn coupons for a specific form
exports.uploadLinkedInCoupons = async (req, res) => {
  try {
    const { formSlug, coupons } = req.body;
    
    if (!formSlug || !coupons || !Array.isArray(coupons) || coupons.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Form slug and coupons array are required'
      });
    }
    
    // Find the form by slug
    const form = await Form.findOne({ slug: formSlug });
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }
    
    console.log(`Uploading ${coupons.length} LinkedIn coupons for form: ${formSlug}`);
    
    // Create a coupon upload record
    const couponUpload = new CouponUpload({
      formId: form._id,
      uploadedBy: req.user ? req.user._id : null,
      count: coupons.length,
      source: 'manual_upload',
      type: 'linkedin_coupons',
      metadata: {
        formSlug,
        uploadTime: new Date()
      }
    });
    
    await couponUpload.save();
    
    // Process each coupon
    const results = {
      total: coupons.length,
      success: 0,
      errors: []
    };
    
    for (const couponData of coupons) {
      try {
        if (!couponData.code || !couponData.linkedInUrl) {
          results.errors.push({
            code: couponData.code || 'MISSING',
            error: 'Coupon code and LinkedIn URL are required'
          });
          continue;
        }
        
        // Check if coupon already exists
        const existingCoupon = await Coupon.findOne({ code: couponData.code });
        
        if (existingCoupon) {
          // Update existing coupon
          existingCoupon.linkedInUrl = couponData.linkedInUrl;
          existingCoupon.formId = form._id;
          existingCoupon.isActive = true;
          existingCoupon.uploadId = couponUpload._id;
          existingCoupon.expiryDate = couponData.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default
          
          await existingCoupon.save();
        } else {
          // Create new coupon
          const coupon = new Coupon({
            code: couponData.code,
            linkedInUrl: couponData.linkedInUrl,
            formId: form._id,
            isActive: true,
            isPercentage: true,
            discount: 0,
            maxUses: 1,
            usedCount: 0,
            isUsed: false,
            uploadId: couponUpload._id,
            expiryDate: couponData.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year default
          });
          
          await coupon.save();
        }
        
        results.success++;
      } catch (error) {
        console.error(`Error processing coupon ${couponData.code}:`, error);
        results.errors.push({
          code: couponData.code || 'UNKNOWN',
          error: error.message
        });
      }
    }
    
    // Update upload record with results
    couponUpload.processedCount = results.success;
    couponUpload.status = 'completed';
    couponUpload.metadata.results = results;
    await couponUpload.save();
    
    return res.status(200).json({
      success: true,
      message: `Uploaded ${results.success} LinkedIn coupons for form: ${formSlug}`,
      results
    });
    
  } catch (error) {
    console.error('Error uploading LinkedIn coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload LinkedIn coupons',
      error: error.message
    });
  }
};
