const Coupon = require('../models/Coupon');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const xlsx = require('xlsx');

// Helper to process coupon data
const processCouponData = async (coupons, userId, formId) => {
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
        formId: couponData.formId || formId || null
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

// Upload coupons from CSV or Excel file
exports.uploadCoupons = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let coupons = [];
    const formId = req.body.formId || null;

    // Process CSV file
    if (fileExt === '.csv') {
      const results = [];
      await new Promise((resolve, reject) => {
        const readableStream = new Readable();
        readableStream._read = () => {};
        readableStream.push(req.file.buffer);
        readableStream.push(null);

        readableStream
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
      coupons = results;
    } 
    // Process Excel file
    else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      
      // Try to get data from all sheets
      let allSheetData = [];
      
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (sheetData && sheetData.length > 0) {
          // Add sheet name to each row for tracking
          const dataWithSheetName = sheetData.map(row => ({
            ...row,
            _sheetName: sheetName
          }));
          allSheetData = [...allSheetData, ...dataWithSheetName];
        } else {
          // Try to extract data from all columns if no structured data found
          const range = xlsx.utils.decode_range(worksheet['!ref']);
          const codes = [];
          
          // Process each row
          for (let row = range.s.r; row <= range.e.r; row++) {
            const rowData = {};
            // Process each column
            for (let col = range.s.c; col <= range.e.c; col++) {
              const cellAddress = xlsx.utils.encode_cell({ r: row, c: col });
              const cell = worksheet[cellAddress];
              if (cell && cell.v !== undefined) {
                // For the first row, use cell value as header
                if (row === range.s.r) {
                  rowData[`col_${col}`] = cell.v.toString().trim();
                } else {
                  // For other rows, use the header from first row
                  const headerAddress = xlsx.utils.encode_cell({ r: range.s.r, c: col });
                  const headerCell = worksheet[headerAddress];
                  const header = headerCell ? headerCell.v.toString().trim() : `col_${col}`;
                  rowData[header] = cell.v.toString().trim();
                }
              }
            }
            // Only add rows that have actual data
            if (Object.values(rowData).some(value => value && value.length > 0)) {
              codes.push({
                ...rowData,
                _sheetName: sheetName
              });
            }
          }
          if (codes.length > 0) {
            allSheetData = [...allSheetData, ...codes];
          }
        }
      }
      
      coupons = allSheetData;
    } 
    // Handle simple text files with one coupon per line
    else if (fileExt === '.txt') {
      const content = req.file.buffer.toString('utf8');
      coupons = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(code => ({ code }));
    }
    else {
      return res.status(400).json({ success: false, message: 'Unsupported file format. Please upload CSV, Excel, or TXT file.' });
    }

    // Handle empty file
    if (!coupons || coupons.length === 0) {
      return res.status(400).json({ success: false, message: 'No coupon data found in the file' });
    }

    console.log(`Processing ${coupons.length} coupons from uploaded file`);
    
    // Process coupons
    const results = await processCouponData(coupons, req.user.id, formId);

    return res.status(200).json({
      success: true,
      message: `Uploaded ${results.added} coupons. ${results.duplicates} duplicates skipped. ${results.errors.length} errors.`,
      data: results.processed,
      details: {
        added: results.added,
        duplicates: results.duplicates,
        errors: results.errors
      }
    });
  } catch (error) {
    console.error('Error uploading coupons:', error);
    return res.status(500).json({ success: false, message: 'Server error while uploading coupons' });
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

// Track when a coupon code is copied
exports.trackCouponCopy = async (req, res) => {
  try {
    const { code, formId } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    
    // Find coupon by code
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    // Add copy event
    coupon.copyEvents.push({
      timestamp: new Date(),
      ipAddress,
      userAgent,
      formId
    });
    
    await coupon.save();
    
    res.status(200).json({
      success: true,
      message: 'Coupon copy event tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking coupon copy:', error);
    res.status(500).json({ success: false, message: 'Error tracking coupon copy', error: error.message });
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
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
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
