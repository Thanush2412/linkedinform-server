const MasterData = require('../models/MasterData');
const Registration = require('../models/Registration');
const Form = require('../models/Form');
const Coupon = require('../models/Coupon');
const CouponUpload = require('../models/CouponUpload');
const User = require('../models/User');
const Otp = require('../models/Otp');
const mongoose = require('mongoose');

// Sync all data into the master table
exports.syncMasterData = async (req, res) => {
  try {
    const startTime = Date.now();
    let stats = {
      added: 0,
      updated: 0,
      skipped: 0,
      total: 0,
      errors: 0
    };

    // Get all registrations with populated data
    const registrations = await Registration.find()
      .populate('form')
      .populate('coupon')
      .sort({ createdAt: -1 });
      
    // Get OTP data for each registration
    const otpData = await Otp.find({ mobile: { $in: registrations.map(r => r.mobile) } });
    
    // Update existing master records with OTP data if available
    await MasterData.updateMany(
      { 'registration.mobile': { $in: otpData.map(otp => otp.mobile) } },
      { $set: { 
        'otp.id': { $first: otpData.filter(otp => otp.mobile === '$registration.mobile')._id },
        'otp.mobile': { $first: otpData.filter(otp => otp.mobile === '$registration.mobile').mobile },
        'otp.verified': { $first: otpData.filter(otp => otp.mobile === '$registration.mobile').verified },
        'otp.expires_at': { $first: otpData.filter(otp => otp.mobile === '$registration.mobile').expires_at },
        'otp.createdAt': { $first: otpData.filter(otp => otp.mobile === '$registration.mobile').createdAt }
      } }
    );

    console.log(`Processing ${registrations.length} registrations for master data sync`);
    
    // Process each registration
    for (const registration of registrations) {
      try {
        stats.total++;
        
        // Upsert operation - update existing or insert new
        const updateData = {
          'registration.id': registration._id,
          'registration.name': registration.name,
          'registration.email': registration.email,
          'registration.mobile': registration.mobile,
          'registration.college': registration.college,
          'registration.register_number': registration.register_number,
          'registration.yop': registration.yop,
          'registration.dynamicFields': registration.dynamicFields || {},
          'registration.createdAt': registration.createdAt,
          'registration.updatedAt': registration.updatedAt,
          'registration.isActive': registration.isActive,
          'registration.inactiveReason': registration.inactiveReason,
          'registration.linkedInUrl': registration.linkedInUrl,
          'registration.location': registration.location || null,
          'registration.attendance': registration.attendance || false,
          'registration.attendanceMarkedBy': registration.attendanceMarkedBy || null,
          'registration.attendanceMarkedAt': registration.attendanceMarkedAt || null,
          lastSync: Date.now()
        };
        
        const result = await MasterData.updateOne(
          { 'registration.id': registration._id },
          { $set: updateData },
          { upsert: true }
        );
        
        if (result.upsertedId) {
          stats.added++;
        } else if (result.modifiedCount > 0) {
          stats.updated++;
        } else {
          stats.skipped++;
        }
        
        // Get or create master record
        let masterRecord = await MasterData.findOne({ 'registration.id': registration._id });
        if (!masterRecord) {
          masterRecord = new MasterData();
          masterRecord.registration = {};
        }
        
        // Update registration data with all fields
        masterRecord.registration = {
          id: registration._id,
          name: registration.name,
          email: registration.email,
          mobile: registration.mobile,
          college: registration.college,
          register_number: registration.register_number,
          yop: registration.yop,
          dynamicFields: registration.dynamicFields || {},
          createdAt: registration.createdAt,
          updatedAt: registration.updatedAt,
          isActive: registration.isActive,
          inactiveReason: registration.inactiveReason,
          linkedInUrl: registration.linkedInUrl,
          location: registration.location || null,
          attendance: registration.attendance || false,
          attendanceMarkedBy: registration.attendanceMarkedBy || null,
          attendanceMarkedAt: registration.attendanceMarkedAt || null
        };
        
        // Add OTP data if available
        const registrationOtp = otpData.find(otp => otp.mobile === registration.mobile);
        if (registrationOtp) {
          masterRecord.otp = {
            id: registrationOtp._id,
            mobile: registrationOtp.mobile,
            otp: registrationOtp.otp,
            verified: registrationOtp.verified,
            expires_at: registrationOtp.expires_at,
            createdAt: registrationOtp.createdAt,
            updatedAt: registrationOtp.updatedAt
          };
          updateData.otp = masterRecord.otp;
        }
        
        // Update form data with all fields if available
        if (registration.form) {
          const form = registration.form;
          masterRecord.form = {
            id: form._id,
            slug: form.slug,
            college: form.college,
            employee_number: form.employee_number,
            activation: form.activation,
            deactivation: form.deactivation,
            isActive: form.isActive,
            created_by: form.created_by,
            couponLimit: form.couponLimit,
            fields: form.fields,
            latitude: form.latitude,
            longitude: form.longitude,
            radius: form.radius,
            requireLocation: form.requireLocation,
            appearance: form.appearance
          };
          
          // If form has created_by, add user data
          if (form.created_by) {
            try {
              const user = await User.findById(form.created_by);
              if (user) {
                masterRecord.user = {
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  createdAt: user.createdAt
                };
              }
            } catch (userError) {
              console.error('Error fetching user data from form:', userError);
            }
          }
        }
        
        // Update coupon data if available
        if (registration.couponCode) {
          const coupon = await Coupon.findOne({ code: registration.couponCode })
            .populate('formId')
            .populate('createdBy')
            .populate('uploadId')
            .populate('usedBy.registrationId')
            .populate('copyEvents.formId');
          
          if (coupon) {
            masterRecord.coupon = {
              id: coupon._id,
              code: coupon.code,
              linkedInUrl: coupon.linkedInUrl,
              isUsed: coupon.isUsed || false,
              usedAt: coupon.usedBy && coupon.usedBy.length > 0 ? coupon.usedBy[0].usedAt : null,
              isActive: coupon.isActive,
              expiryDate: coupon.expiryDate,
              description: coupon.description || `Coupon ${coupon.code}`,
              discount: coupon.discount,
              isPercentage: coupon.isPercentage,
              maxUses: coupon.maxUses,
              usedCount: coupon.usedCount,
              metadata: coupon.metadata || {},
              createdAt: coupon.createdAt,
              updatedAt: coupon.updatedAt,
              formId: coupon.formId,
              createdBy: coupon.createdBy,
              usedBy: coupon.usedBy || [],
              copyEvents: coupon.copyEvents || []
            };
            
            // Calculate copyTime from events
            if (coupon.copyEvents && coupon.copyEvents.length > 0) {
              const copyEvent = coupon.copyEvents.find(event => 
                event.viewTime && (event.registrationTime || event.timestamp)
              );
              
              if (copyEvent && copyEvent.viewTime) {
                const viewTime = new Date(copyEvent.viewTime);
                const copyTime = copyEvent.registrationTime 
                  ? new Date(copyEvent.registrationTime) 
                  : new Date(copyEvent.timestamp);
                
                masterRecord.coupon.copyTime = Math.round((copyTime - viewTime) / 1000);
              }
            }

            // Store detailed activity data
            if (coupon.copyEvents && coupon.copyEvents.length > 0) {
              masterRecord.coupon.activity = {
                lastViewed: coupon.copyEvents[0].viewTime,
                lastCopied: coupon.copyEvents[0].timestamp,
                lastBannerCopy: coupon.copyEvents[0].bannerCopyTime,
                copySource: coupon.copyEvents[0].source,
                fromSuccessBanner: coupon.copyEvents[0].fromSuccessBanner,
                ipAddress: coupon.copyEvents[0].ipAddress,
                deviceType: coupon.copyEvents[0].userAgent ? 
                  (coupon.copyEvents[0].userAgent.includes('Mobile') ? 'Mobile' : 
                  (coupon.copyEvents[0].userAgent.includes('Tablet') ? 'Tablet' : 'Desktop')) : 'Unknown',
                totalCopies: coupon.copyEvents.length,
                firstCopy: coupon.copyEvents[coupon.copyEvents.length - 1]?.timestamp,
                lastCopy: coupon.copyEvents[0]?.timestamp
              };
            }

            // Store usage history
            if (coupon.usedBy && coupon.usedBy.length > 0) {
              masterRecord.coupon.usageHistory = coupon.usedBy.map(usage => ({
                usedAt: usage.usedAt,
                userDetails: usage.userDetails || {},
                formDetails: usage.formDetails || {},
                ip: usage.ip,
                device: usage.device
              }));
            }
            
            // Update coupon upload data if available
            if (coupon.uploadId) {
              const couponUpload = await CouponUpload.findById(coupon.uploadId)
                .populate('uploadedBy');
              
              if (couponUpload) {
                masterRecord.couponUpload = {
                  id: couponUpload._id,
                  fileName: couponUpload.fileName,
                  originalName: couponUpload.originalName,
                  uploadDate: couponUpload.uploadDate,
                  uploadedBy: couponUpload.uploadedBy,
                  couponsAdded: couponUpload.couponsAdded,
                  couponsUsed: couponUpload.couponsUsed,
                  status: couponUpload.status,
                  metadata: couponUpload.metadata,
                  fileSize: couponUpload.fileSize,
                  mimeType: couponUpload.mimeType,
                  duplicatesSkipped: couponUpload.duplicatesSkipped,
                  errors: couponUpload.errors || []
                };
                
                // Update user data from upload if not already set
                if (couponUpload.uploadedBy && !masterRecord.user) {
                  const uploadUser = await User.findById(couponUpload.uploadedBy);
                  if (uploadUser) {
                    masterRecord.user = {
                      id: uploadUser._id,
                      name: uploadUser.name,
                      email: uploadUser.email,
                      role: uploadUser.role,
                      createdAt: uploadUser.createdAt
                    };
                  }
                }
              }
            }
          }
        }
        
        // Update last sync time
        masterRecord.lastSync = new Date();
        
        // Save the record
        await masterRecord.save();
        
      } catch (error) {
        console.error(`Error processing registration ${registration._id}:`, error);
        stats.errors++;
      }
    }
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    res.json({
      success: true,
      stats,
      processingTime: `${processingTime.toFixed(2)} seconds`
    });
    
  } catch (error) {
    console.error('Error syncing master data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error syncing master data',
      error: error.message
    });
  }
};

// Get all master data with advanced filtering
exports.getMasterData = async (req, res) => {
  try {
    const { 
      search, 
      formId, 
      couponStatus, 
      employeeNumber, 
      startDate, 
      endDate,
      attendance,
      sortField = 'registration.createdAt', 
      sortOrder = 'desc',
      limit = 50,
      page = 1
    } = req.query;
    
    // Build query
    const query = {};
    
    // Search across multiple fields
    if (search) {
      query.$or = [
        { 'registration.name': { $regex: search, $options: 'i' } },
        { 'registration.email': { $regex: search, $options: 'i' } },
        { 'registration.mobile': { $regex: search, $options: 'i' } },
        { 'registration.college': { $regex: search, $options: 'i' } },
        { 'registration.register_number': { $regex: search, $options: 'i' } },
        { 'coupon.code': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Form filter
    if (formId) {
      query['form.id'] = mongoose.Types.ObjectId(formId);
    }
    
    // Coupon status filter
    if (couponStatus) {
      if (couponStatus === 'used') {
        query['coupon.isUsed'] = true;
      } else if (couponStatus === 'unused') {
        query['coupon.isUsed'] = false;
        query['coupon.code'] = { $exists: true, $ne: null };
      } else if (couponStatus === 'nocoupon') {
        query['coupon.code'] = { $exists: false };
      }
    }
    
    // Employee number filter
    if (employeeNumber) {
      query['registration.dynamicFields.employee_number'] = employeeNumber;
    }
    
    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      query['registration.createdAt'] = { $gte: start, $lte: end };
    }
    
    // Attendance filter
    if (attendance) {
      if (attendance === 'present') {
        query['registration.attendance'] = true;
      } else if (attendance === 'absent') {
        query['registration.attendance'] = { $ne: true };
      }
    }
    
    // Sort options
    const sortOptions = {};
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;
    
    // Add secondary sort by createdAt for consistency
    if (sortField !== 'registration.createdAt') {
      sortOptions['registration.createdAt'] = -1;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
    
    // Get total count
    const totalCount = await MasterData.countDocuments(query);
    
    // Get data with pagination
    const masterData = await MasterData.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      success: true,
      masterData,
      totalCount,
      page: parseInt(page),
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum)
    });
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching master data',
      error: error.message
    });
  }
};

// Get master data statistics
exports.getMasterDataStats = async (req, res) => {
  try {
    // Get total count
    const totalRecords = await MasterData.countDocuments();
    
    // Get count by coupon status
    const withCoupon = await MasterData.countDocuments({ 'coupon.code': { $ne: null } });
    const usedCoupon = await MasterData.countDocuments({ 'coupon.isUsed': true });
    const unusedCoupon = await MasterData.countDocuments({ 
      'coupon.code': { $ne: null }, 
      'coupon.isUsed': false 
    });
    
    // Get colleges
    const colleges = await MasterData.aggregate([
      { $group: { _id: '$registration.college', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get forms
    const forms = await MasterData.aggregate([
      { $group: { _id: '$form.slug', college: { $first: '$form.college' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Response
    res.json({
      success: true,
      stats: {
        totalRecords,
        couponStats: {
          withCoupon,
          usedCoupon,
          unusedCoupon,
          noCoupon: totalRecords - withCoupon
        },
        topColleges: colleges,
        topForms: forms
      }
    });
    
  } catch (error) {
    console.error('Error getting master data statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving master data statistics',
      error: error.message
    });
  }
};

// Export master data to Excel
exports.exportMasterDataExcel = async (req, res) => {
  try {
    const { 
      limit = 5000, 
      formId, 
      couponStatus, 
      search,
      startDate,
      endDate,
      employeeNumber,
      college,
      sortField = 'registration.createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    let query = {};
    
    // Filter by form
    if (formId) {
      query['form.id'] = mongoose.Types.ObjectId(formId);
    }
    
    // Filter by coupon status
    if (couponStatus === 'used') {
      query['coupon.isUsed'] = true;
    } else if (couponStatus === 'unused') {
      query['coupon.code'] = { $ne: null };
      query['coupon.isUsed'] = false;
    } else if (couponStatus === 'nocoupon') {
      query['coupon.code'] = null;
    }
    
    // Filter by date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query['registration.createdAt'] = { $gte: start, $lte: end };
    }
    
    // Filter by employee number
    if (employeeNumber) {
      query.$or = [
        { 'registration.dynamicFields.employee_number': employeeNumber },
        { 'form.employee_number': employeeNumber }
      ];
    }
    
    // Filter by college
    if (college) {
      query['registration.college'] = { $regex: new RegExp(college, 'i') };
    }
    
    // Search text
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = query.$or || [];
      query.$or.push(
        { 'registration.name': searchRegex },
        { 'registration.email': searchRegex },
        { 'registration.mobile': searchRegex },
        { 'registration.college': searchRegex },
        { 'coupon.code': searchRegex }
      );
    }
    
    // Set up sorting
    const sortOptions = {};
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;
    
    // Get master data
    const masterData = await MasterData.find(query)
      .sort(sortOptions)
      .limit(parseInt(limit));
    
    // Return the results with counts
    res.json({
      success: true,
      message: 'Excel export functionality would be implemented with Excel4Node or similar library',
      recordCount: masterData.length,
      totalCount: await MasterData.countDocuments(query)
    });
    
  } catch (error) {
    console.error('Error exporting master data to Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting master data',
      error: error.message
    });
  }
};

// Sync a specific registration to master data
exports.syncSingleRegistration = async (req, res) => {
  try {
    const { registrationId } = req.params;
    
    if (!registrationId) {
      return res.status(400).json({ success: false, message: 'Registration ID is required' });
    }

    // Find the registration with populated data
    const registration = await Registration.findById(registrationId)
      .populate('form')
      .populate('coupon');
    
    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    
    // Get OTP data for the registration
    const registrationOtp = await Otp.findOne({ mobile: registration.mobile });
    
    // Initialize new master record if it doesn't exist, or get existing
    let masterRecord = await MasterData.findOne({ 'registration.id': registration._id });
    if (!masterRecord) {
      masterRecord = new MasterData();
      masterRecord.registration = {};
    }
    
    // Update registration data with all fields
    masterRecord.registration = {
      id: registration._id,
      name: registration.name,
      email: registration.email,
      mobile: registration.mobile,
      college: registration.college,
      register_number: registration.register_number,
      yop: registration.yop,
      dynamicFields: registration.dynamicFields || {},
      createdAt: registration.createdAt,
      updatedAt: registration.updatedAt,
      isActive: registration.isActive,
      inactiveReason: registration.inactiveReason,
      linkedInUrl: registration.linkedInUrl,
      location: registration.location || null,
      attendance: registration.attendance || false,
      attendanceMarkedBy: registration.attendanceMarkedBy || null,
      attendanceMarkedAt: registration.attendanceMarkedAt || null
    };
    
    // Add OTP data if available
    if (registrationOtp) {
      masterRecord.otp = {
        id: registrationOtp._id,
        mobile: registrationOtp.mobile,
        otp: registrationOtp.otp,
        verified: registrationOtp.verified,
        expires_at: registrationOtp.expires_at,
        createdAt: registrationOtp.createdAt,
        updatedAt: registrationOtp.updatedAt
      };
      masterRecord.registration.otp = masterRecord.otp;
    }
    
    // Update form data with more details
    if (registration.form) {
      const form = registration.form;
      masterRecord.form = {
        id: form._id,
        slug: form.slug,
        college: form.college,
        employee_number: form.employee_number,
        activation: form.activation,
        deactivation: form.deactivation,
        isActive: form.isActive,
        created_by: form.created_by,
        couponLimit: form.couponLimit,
        fields: form.fields,
        latitude: form.latitude,
        longitude: form.longitude,
        radius: form.radius,
        requireLocation: form.requireLocation,
        appearance: form.appearance
      };
      
      // If form has created_by, add user data
      if (form.created_by && !masterRecord.user) {
        try {
          const user = await User.findById(form.created_by);
          if (user) {
            masterRecord.user = {
              id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              createdAt: user.createdAt
            };
          }
        } catch (userError) {
          console.error('Error fetching user data from form:', userError);
        }
      }
    }
    
    // Update location if available
    if (registration.location) {
      masterRecord.location = registration.location;
    }
    
    // If there's a coupon code, try to fetch the coupon with more details
    if (registration.couponCode) {
      const coupon = await Coupon.findOne({ code: registration.couponCode });
      
      if (coupon) {
        masterRecord.coupon.id = coupon._id;
        masterRecord.coupon.code = coupon.code;
        masterRecord.coupon.linkedInUrl = coupon.linkedInUrl;
        masterRecord.coupon.isUsed = registration.couponUsed || false;
        masterRecord.coupon.usedAt = registration.couponUsedAt;
        masterRecord.coupon.isActive = coupon.isActive;
        masterRecord.coupon.expiryDate = coupon.expiryDate;
        masterRecord.coupon.description = coupon.description;
        masterRecord.coupon.discount = coupon.discount;
        masterRecord.coupon.isPercentage = coupon.isPercentage;
        masterRecord.coupon.maxUses = coupon.maxUses;
        masterRecord.coupon.usedCount = coupon.usedCount;
        masterRecord.coupon.metadata = coupon.metadata;
        masterRecord.coupon.createdAt = coupon.createdAt;
        masterRecord.coupon.updatedAt = coupon.updatedAt;
        
        // Add formId reference
        if (coupon.formId) {
          masterRecord.coupon.formId = coupon.formId;
        }
        
        // Add createdBy reference
        if (coupon.createdBy) {
          masterRecord.coupon.createdBy = coupon.createdBy;
        }
        
        // Store complete usedBy array from coupon
        if (coupon.usedBy && coupon.usedBy.length > 0) {
          masterRecord.coupon.usedBy = coupon.usedBy;
        }
        
        // Store complete copyEvents array from coupon
        if (coupon.copyEvents && coupon.copyEvents.length > 0) {
          masterRecord.coupon.copyEvents = coupon.copyEvents;
          
          // Still calculate copyTime from the most relevant event for quick access
          const copyEvent = coupon.copyEvents.find(event => 
            event.viewTime && (event.registrationTime || event.timestamp)
          );
          
          if (copyEvent && copyEvent.viewTime) {
            const viewTime = new Date(copyEvent.viewTime);
            const copyTime = copyEvent.registrationTime 
              ? new Date(copyEvent.registrationTime) 
              : new Date(copyEvent.timestamp);
            
            masterRecord.coupon.copyTime = Math.round((copyTime - viewTime) / 1000);
          }
        }
        
        // Store detailed activity data
        if (coupon.copyEvents && coupon.copyEvents.length > 0) {
          masterRecord.coupon.activity = {
            lastViewed: coupon.copyEvents[0].viewTime,
            lastCopied: coupon.copyEvents[0].timestamp,
            lastBannerCopy: coupon.copyEvents[0].bannerCopyTime,
            copySource: coupon.copyEvents[0].source,
            fromSuccessBanner: coupon.copyEvents[0].fromSuccessBanner,
            ipAddress: coupon.copyEvents[0].ipAddress,
            deviceType: coupon.copyEvents[0].userAgent ? 
              (coupon.copyEvents[0].userAgent.includes('Mobile') ? 'Mobile' : 
              (coupon.copyEvents[0].userAgent.includes('Tablet') ? 'Tablet' : 'Desktop')) : 'Unknown',
            totalCopies: coupon.copyEvents.length,
            firstCopy: coupon.copyEvents[coupon.copyEvents.length - 1]?.timestamp,
            lastCopy: coupon.copyEvents[0]?.timestamp
          };
        }

        // Store usage history
        if (coupon.usedBy && coupon.usedBy.length > 0) {
          masterRecord.coupon.usageHistory = coupon.usedBy.map(usage => ({
            usedAt: usage.usedAt,
            userDetails: usage.userDetails || {},
            formDetails: usage.formDetails || {},
            ip: usage.ip,
            device: usage.device
          }));
        }
        
        // If coupon has uploadId, sync coupon upload data
        if (coupon.uploadId) {
          try {
            const couponUpload = await CouponUpload.findById(coupon.uploadId);
            if (couponUpload) {
              masterRecord.couponUpload = {
                id: couponUpload._id,
                fileName: couponUpload.fileName,
                originalName: couponUpload.originalName,
                uploadDate: couponUpload.uploadDate,
                uploadedBy: couponUpload.uploadedBy,
                couponsAdded: couponUpload.couponsAdded,
                couponsUsed: couponUpload.couponsUsed,
                status: couponUpload.status,
                metadata: couponUpload.metadata
              };
              
              // If user created the upload, add user data
              if (couponUpload.uploadedBy) {
                try {
                  const user = await User.findById(couponUpload.uploadedBy);
                  if (user) {
                    masterRecord.user = {
                      id: user._id,
                      name: user.name,
                      email: user.email,
                      role: user.role,
                      createdAt: user.createdAt
                    };
                  }
                } catch (userError) {
                  console.error('Error fetching user data:', userError);
                }
              }
            }
          } catch (uploadError) {
            console.error('Error fetching coupon upload data:', uploadError);
          }
        }
        
        // If coupon has createdBy, add user data
        if (coupon.createdBy) {
          try {
            const user = await User.findById(coupon.createdBy);
            if (user && !masterRecord.user) {
              masterRecord.user = {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt
              };
            }
          } catch (userError) {
            console.error('Error fetching user data from coupon:', userError);
          }
        }
      } else {
        // Coupon code exists but coupon not found
        masterRecord.coupon.code = registration.couponCode;
        masterRecord.coupon.isUsed = registration.couponUsed || false;
        masterRecord.coupon.usedAt = registration.couponUsedAt;
      }
    } else {
      // Reset coupon data if no coupon code
      masterRecord.coupon = {
        code: null,
        isUsed: false
      };
    }
    
    // Update last sync time
    masterRecord.lastSync = new Date();
    
    // Save the record
    await masterRecord.save();
    
    res.json({
      success: true,
      message: 'Registration added to master data',
      masterRecord
    });
    
  } catch (error) {
    console.error('Error syncing single registration:', error);
    res.status(500).json({
      success: false,
      message: 'Server error syncing registration to master data',
      error: error.message
    });
  }
};