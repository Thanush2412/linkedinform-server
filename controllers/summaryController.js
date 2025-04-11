const Registration = require('../models/Registration');
const Form = require('../models/Form');

// Get registration summary by date and YOP
exports.getSummaryByDate = async (req, res) => {
  try {
    const { startDate, endDate, college, slug, yop } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range parameters are required' });
    }
    
    // Parse dates
    const queryStartDate = new Date(startDate);
    const startOfDay = new Date(queryStartDate.setHours(0, 0, 0, 0));
    
    const queryEndDate = new Date(endDate);
    const endOfDay = new Date(queryEndDate.setHours(23, 59, 59, 999));
    
    // Build query
    let query = {
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    };
    
    // Add optional filters
    if (college) {
      query.college = college;
    }
    
    if (slug) {
      const form = await Form.findOne({ slug });
      if (form) {
        query.form = form._id;
      }
    }
    
    if (yop) {
      query.yop = yop;
    }
    
    // Get all forms in the system (showing data from all users)
    if (!slug) {
      const allForms = await Form.find({});
      const formIds = allForms.map(form => form._id);
      query.form = { $in: formIds };
    }
    
    // Get distinct YOPs in the system (from all users)
    const yops = await Registration.distinct('yop');
    
    // Get registrations grouped by hour and YOP (keeping this for backward compatibility)
    const registrations = await Registration.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            yop: '$yop'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.hour': 1, '_id.yop': 1 } }
    ]);
    
    // Get detailed registrations list with more complete information
    const registrationsList = await Registration.find(query)
      .sort({ createdAt: -1 })
      .populate('form', 'slug college')
      .populate('coupon')
      .limit(500);
    
    // Transform to add more detailed information for each registration
    const detailedRegistrations = registrationsList.map(reg => {
      const regObj = reg.toObject();
      
      // Add formatted fields and additional data
      regObj.formSlug = reg.form ? reg.form.slug : null;
      regObj.formCollege = reg.form ? reg.form.college : null;
      regObj.formattedDate = reg.createdAt.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      regObj.formattedTime = reg.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
      
      // Add coupon information
      regObj.hasCoupon = !!reg.couponCode;
      regObj.couponUsed = reg.couponUsed || false;
      regObj.couponUsedTime = reg.couponUsedAt ? 
        reg.couponUsedAt.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit'
        }) : null;
      
      return regObj;
    });
    
    // Get all form IDs in the system
    const allFormIds = await Form.distinct('_id');
    
    // Get list of colleges for filters - improved query
    const registrationColleges = await Registration.aggregate([
      { $match: { form: { $in: allFormIds } } },
      { $group: { _id: '$college' } },
      { $sort: { _id: 1 } }
    ]);
    
    // Also get colleges from all forms in the system
    const formColleges = await Form.aggregate([
      { $group: { _id: '$college' } },
      { $sort: { _id: 1 } }
    ]);
    
    // Combine both sets of colleges and remove duplicates
    const collegeNames = [...registrationColleges, ...formColleges].map(c => c._id);
    const uniqueColleges = [...new Set(collegeNames)].filter(Boolean).sort();
    
    // Get all form slugs in the system (visible to all users)
    const slugs = await Form.distinct('slug');
    
    // Format data for response (keeping for backward compatibility)
    const formattedData = {};
    
    // Initialize all hours with zero counts
    for (let i = 0; i < 24; i++) {
      const hour = i < 10 ? `0${i}:00` : `${i}:00`;
      formattedData[hour] = {};
      
      yops.forEach(yop => {
        formattedData[hour][yop] = 0;
      });
    }
    
    // Fill in actual counts
    registrations.forEach(reg => {
      const hour = reg._id.hour;
      const hourString = hour < 10 ? `0${hour}:00` : `${hour}:00`;
      const yop = reg._id.yop;
      
      formattedData[hourString][yop] = reg.count;
    });
    
    // Return data
    res.json({
      success: true,
      data: formattedData,
      yops,
      colleges: uniqueColleges,
      slugs,
      registrations: detailedRegistrations,
      totalRegistrations: detailedRegistrations.length
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get registration count by college
exports.getCollegeSummary = async (req, res) => {
  try {
    // Get all forms in the system (showing data from all users)
    const allForms = await Form.find({});
    const formIds = allForms.map(form => form._id);

    // Aggregate registrations by college
    const collegeStats = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      {
        $group: {
          _id: '$college',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: collegeStats
    });
  } catch (error) {
    console.error('College summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get registration statistics
exports.getStatistics = async (req, res) => {
  try {
    // Get all forms in the system (showing data from all users)
    const allForms = await Form.find({});
    const formIds = allForms.map(form => form._id);
    
    // Get total registrations count
    const totalRegistrations = await Registration.countDocuments({ form: { $in: formIds } });
    
    // Get today's registrations
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));
    
    const registrationsToday = await Registration.countDocuments({
      form: { $in: formIds },
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });
    
    // Get yesterday's registrations
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));
    
    const registrationsYesterday = await Registration.countDocuments({
      form: { $in: formIds },
      createdAt: { $gte: startOfYesterday, $lte: endOfYesterday }
    });
    
    // Calculate growth rate
    const growthRate = registrationsYesterday === 0 
      ? 100 
      : ((registrationsToday - registrationsYesterday) / registrationsYesterday) * 100;
    
    // Find top college
    const topCollegeResult = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      { $group: { _id: '$college', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    
    const topCollege = topCollegeResult.length > 0 ? topCollegeResult[0]._id : 'None';
    
    // Find top form
    const topFormResult = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      { $group: { _id: '$form', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    
    let topForm = 'None';
    if (topFormResult.length > 0) {
      const formDetails = await Form.findById(topFormResult[0]._id);
      topForm = formDetails ? formDetails.slug : 'None';
    }
    
    // Calculate conversion rate (if available)
    const conversionRate = 0; // Placeholder for future implementation
    
    res.json({
      success: true,
      data: {
        totalRegistrations,
        registrationsToday,
        registrationsYesterday,
        growthRate: parseFloat(growthRate.toFixed(2)),
        topCollege,
        topForm,
        conversionRate
      }
    });
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export registrations to CSV
exports.exportRegistrations = async (req, res) => {
  try {
    const { startDate, endDate, college, slug, yop } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range parameters are required' });
    }
    
    // Parse dates
    const queryStartDate = new Date(startDate);
    const startOfDay = new Date(queryStartDate.setHours(0, 0, 0, 0));
    
    const queryEndDate = new Date(endDate);
    const endOfDay = new Date(queryEndDate.setHours(23, 59, 59, 999));
    
    // Build query
    let query = {
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    };
    
    // Add optional filters
    if (college) {
      query.college = college;
    }
    
    if (slug) {
      const form = await Form.findOne({ slug });
      if (form) {
        query.form = form._id;
      }
    }
    
    if (yop) {
      query.yop = yop;
    }
    
    // Get all forms in the system if no specific form selected (showing data from all users)
    if (!slug) {
      const allForms = await Form.find({});
      const formIds = allForms.map(form => form._id);
      query.form = { $in: formIds };
    }
    
    // Get registrations
    const registrations = await Registration.find(query)
      .populate('form', 'slug')
      .sort({ createdAt: -1 });
    
    // Generate CSV headers
    const headers = ['Name', 'Email', 'Mobile', 'College', 'Register Number', 'YOP', 'Form', 'Created At'];
    
    // Generate CSV content
    let csvContent = headers.join(',') + '\n';
    
    registrations.forEach(reg => {
      const formSlug = reg.form ? reg.form.slug : '';
      const row = [
        `"${reg.name.replace(/"/g, '""')}"`,
        `"${reg.email.replace(/"/g, '""')}"`,
        `"${reg.mobile}"`,
        `"${reg.college.replace(/"/g, '""')}"`,
        `"${reg.register_number}"`,
        `"${reg.yop}"`,
        `"${formSlug}"`,
        `"${reg.createdAt.toISOString()}"`
      ];
      
      csvContent += row.join(',') + '\n';
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=registrations_${startDate}_to_${endDate}.csv`);
    
    // Send CSV
    res.send(csvContent);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get site activity history
exports.getSiteActivityHistory = async (req, res) => {
  try {
    // Get all forms in the system (showing data from all users)
    const allForms = await Form.find({});
    const formIds = allForms.map(form => form._id);
    
    // Get registration activity summary (grouped by date and form)
    const registrationSummary = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            formId: "$form"
          },
          count: { $sum: 1 },
          firstRegistration: { $min: "$createdAt" },
          lastRegistration: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "forms",
          localField: "_id.formId",
          foreignField: "_id",
          as: "formDetails"
        }
      },
      { $unwind: "$formDetails" },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          formSlug: "$formDetails.slug",
          formName: "$formDetails.college",
          count: 1,
          firstRegistration: 1,
          lastRegistration: 1
        }
      },
      { $sort: { date: -1, count: -1 } }
    ]);
    
    // Get individual registration activities (limited to the most recent 200)
    const individualRegistrations = await Registration.find({ form: { $in: formIds } })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('form', 'slug college');
    
    const registrationActivities = individualRegistrations.map(reg => ({
      date: reg.createdAt.toISOString().split('T')[0],
      activity: "Form Submission",
      details: `${reg.name} from ${reg.college} submitted the form`,
      timestamp: reg.createdAt,
      formSlug: reg.form ? reg.form.slug : null,
      formName: reg.form ? reg.form.college : null,
      user: {
        name: reg.name,
        email: reg.email,
        college: reg.college
      },
      hasCoupon: !!reg.couponCode,
      couponUsed: reg.couponUsed || false,
      entityType: 'registration',
      entityId: reg._id
    }));
    
    // Get form creation and update activity from all users
    const formActivity = await Form.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "creator"
        }
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          slug: 1,
          college: 1,
          createdAt: 1,
          updatedAt: 1,
          creator: {
            name: "$creator.name",
            email: "$creator.email",
            role: "$creator.role"
          },
          type: { $literal: "form_created" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    
    // Combine activities
    const activities = [
      ...formActivity.map(form => ({
        date: form.date,
        activity: "Form Created",
        details: `Form for ${form.college} (${form.slug}) was created`,
        timestamp: form.createdAt,
        formSlug: form.slug,
        formName: form.college,
        creator: form.creator,
        entityType: 'form',
        entityId: form._id
      })),
      ...registrationSummary.map(activity => ({
        date: activity.date,
        activity: "Daily Registrations",
        details: `${activity.count} registrations for ${activity.formName} (${activity.formSlug})`,
        timestamp: activity.lastRegistration,
        count: activity.count,
        formSlug: activity.formSlug,
        formName: activity.formName,
        entityType: 'summary'
      })),
      ...registrationActivities
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Activity history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get advanced site metrics
exports.getSiteMetrics = async (req, res) => {
  try {
    // Get all forms in the system (showing data from all users)
    const allForms = await Form.find({});
    const formIds = allForms.map(form => form._id);
    
    // Get total registrations
    const totalRegistrations = await Registration.countDocuments({ form: { $in: formIds } });
    
    // Get registrations per day for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyRegistrations = await Registration.aggregate([
      { 
        $match: { 
          form: { $in: formIds },
          createdAt: { $gte: thirtyDaysAgo } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get registrations by device type (if available in your schema)
    const deviceRegistrations = { mobile: 0, desktop: 0, tablet: 0, unknown: totalRegistrations };
    
    // Get registrations by hour of day
    const hourlyDistribution = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get form performance metrics
    const formPerformance = await Registration.aggregate([
      { $match: { form: { $in: formIds } } },
      {
        $group: {
          _id: "$form",
          count: { $sum: 1 },
          firstRegistration: { $min: "$createdAt" },
          lastRegistration: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "forms",
          localField: "_id",
          foreignField: "_id",
          as: "formDetails"
        }
      },
      { $unwind: "$formDetails" },
      {
        $project: {
          _id: 0,
          formId: "$_id",
          formName: "$formDetails.college",
          formSlug: "$formDetails.slug",
          registrations: "$count",
          isActive: "$formDetails.isActive",
          start: "$formDetails.activation",
          end: "$formDetails.deactivation",
          firstRegistration: 1,
          lastRegistration: 1
        }
      },
      { $sort: { registrations: -1 } }
    ]);
    
    // Calculate daily average
    const totalDays = Math.max(1, Math.ceil((new Date() - (formPerformance.length > 0 ? new Date(formPerformance[0].start) : new Date())) / (1000 * 60 * 60 * 24)));
    const dailyAverage = totalRegistrations / totalDays;
    
    res.json({
      success: true,
      metrics: {
        totalRegistrations,
        dailyRegistrations,
        hourlyDistribution,
        formPerformance,
        deviceRegistrations,
        dailyAverage: parseFloat(dailyAverage.toFixed(2)),
        activeForms: allForms.filter(form => form.isActive).length,
        totalForms: allForms.length
      }
    });
  } catch (error) {
    console.error('Site metrics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get data metrics grouped by time period
exports.getDataMetrics = async (req, res) => {
  try {
    // Get filter parameters
    const { startDate, endDate, college, groupBy = 'daily' } = req.query;
    
    // Validate dates
    const start = new Date(startDate || new Date(new Date().setDate(new Date().getDate() - 30)));
    const end = new Date(endDate || new Date());
    end.setHours(23, 59, 59, 999); // Set to end of day
    
    // Get all forms in the system (showing data from all users)
    const allForms = await Form.find({});
    const formIds = allForms.map(form => form._id);
    
    // Base match criteria
    const matchCriteria = { 
      form: { $in: formIds },
      createdAt: { $gte: start, $lte: end } 
    };
    
    // Add college filter if provided
    if (college) {
      matchCriteria.college = college;
    }
    
    // Set up time grouping format based on groupBy parameter
    let groupFormat;
    let dateProjection;
    
    switch(groupBy) {
      case 'weekly':
        groupFormat = "%G-W%V"; // ISO week format (YYYY-WXX)
        dateProjection = { $dateToString: { format: "%G-W%V", date: "$createdAt" } };
        break;
      case 'monthly':
        groupFormat = "%Y-%m"; // Year-month format (YYYY-MM)
        dateProjection = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
        break;
      case 'daily':
      default:
        groupFormat = "%Y-%m-%d"; // Year-month-day format (YYYY-MM-DD)
        dateProjection = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
    }
    
    // Get total count
    const totalCount = await Registration.countDocuments(matchCriteria);
    
    // Get grouped time series data
    const timeSeriesData = await Registration.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: dateProjection,
          count: { $sum: 1 },
          colleges: { $addToSet: "$college" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get college breakdown for each time period
    const timeSeriesWithColleges = await Promise.all(
      timeSeriesData.map(async (period) => {
        const collegeBreakdown = await Registration.aggregate([
          { 
            $match: {
              ...matchCriteria,
              createdAt: period._id === dateProjection 
            } 
          },
          {
            $group: {
              _id: "$college",
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              college: "$_id",
              count: 1
            }
          }
        ]);
        
        return {
          timePeriod: period._id,
          count: period.count,
          collegeBreakdown
        };
      })
    );
    
    // Format dates based on grouping
    const formattedTimeSeries = timeSeriesWithColleges.map(item => {
      let formattedPeriod = item.timePeriod;
      
      if (groupBy === 'monthly') {
        const [year, month] = item.timePeriod.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        formattedPeriod = `${monthNames[parseInt(month) - 1]} ${year}`;
      } else if (groupBy === 'weekly') {
        const [year, week] = item.timePeriod.split('-W');
        formattedPeriod = `Week ${week}, ${year}`;
      }
      
      return {
        ...item,
        timePeriod: formattedPeriod
      };
    });
    
    // Get all colleges in the dataset for column headers
    const allColleges = await Registration.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: "$college",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          name: "$_id",
          count: 1
        }
      }
    ]);
    
    // Find peak period and calculate average
    let peakPeriod = null;
    let peakCount = 0;
    
    formattedTimeSeries.forEach(period => {
      if (period.count > peakCount) {
        peakCount = period.count;
        peakPeriod = period.timePeriod;
      }
    });
    
    const averagePerPeriod = formattedTimeSeries.length > 0 
      ? parseFloat((totalCount / formattedTimeSeries.length).toFixed(2)) 
      : 0;
    
    // Return the formatted data
    res.json({
      success: true,
      metrics: {
        totalCount,
        peakPeriod,
        peakCount,
        averagePerPeriod,
        timeSeries: formattedTimeSeries,
        collegeData: allColleges,
        timeGrouping: groupBy
      }
    });
  } catch (error) {
    console.error('Data metrics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export registrations to JSON
exports.exportRegistrationsJson = async (req, res) => {
  try {
    const { startDate, endDate, college, slug, yop } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range parameters are required' });
    }
    
    // Parse dates
    const queryStartDate = new Date(startDate);
    const startOfDay = new Date(queryStartDate.setHours(0, 0, 0, 0));
    
    const queryEndDate = new Date(endDate);
    const endOfDay = new Date(queryEndDate.setHours(23, 59, 59, 999));
    
    // Build query
    let query = {
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    };
    
    // Add optional filters
    if (college) {
      query.college = college;
    }
    
    if (slug) {
      const form = await Form.findOne({ slug });
      if (form) {
        query.form = form._id;
      }
    }
    
    if (yop) {
      query.yop = yop;
    }
    
    // Get all forms in the system if no specific form selected (showing data from all users)
    if (!slug) {
      const allForms = await Form.find({});
      const formIds = allForms.map(form => form._id);
      query.form = { $in: formIds };
    }
    
    // Get registrations
    const registrations = await Registration.find(query)
      .populate('form', 'slug college')
      .sort({ createdAt: -1 });
    
    // Format data for JSON export
    const formattedData = registrations.map(reg => ({
      name: reg.name,
      email: reg.email,
      mobile: reg.mobile,
      college: reg.college,
      register_number: reg.register_number,
      yop: reg.yop,
      form: reg.form ? reg.form.slug : 'Unknown',
      form_name: reg.form ? reg.form.college : 'Unknown',
      created_at: reg.createdAt,
      coupon_code: reg.couponCode || 'None',
      coupon_used: reg.couponUsed || false
    }));
    
    // Set headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=registrations_${startDate}_to_${endDate}.json`);
    
    // Send JSON
    res.json({
      exportDate: new Date(),
      dateRange: {
        start: startDate,
        end: endDate
      },
      filters: {
        college: college || 'All',
        form: slug || 'All',
        yop: yop || 'All'
      },
      totalRecords: formattedData.length,
      data: formattedData
    });
  } catch (error) {
    console.error('JSON Export error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export registrations to Excel
exports.exportRegistrationsExcel = async (req, res) => {
  try {
    const { startDate, endDate, college, slug, yop } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range parameters are required' });
    }
    
    // Parse dates
    const queryStartDate = new Date(startDate);
    const startOfDay = new Date(queryStartDate.setHours(0, 0, 0, 0));
    
    const queryEndDate = new Date(endDate);
    const endOfDay = new Date(queryEndDate.setHours(23, 59, 59, 999));
    
    // Build query
    let query = {
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    };
    
    // Add optional filters
    if (college) {
      query.college = college;
    }
    
    if (slug) {
      const form = await Form.findOne({ slug });
      if (form) {
        query.form = form._id;
      }
    }
    
    if (yop) {
      query.yop = yop;
    }
    
    // Get all forms in the system if no specific form selected (showing data from all users)
    if (!slug) {
      const allForms = await Form.find({});
      const formIds = allForms.map(form => form._id);
      query.form = { $in: formIds };
    }
    
    // Get registrations
    const registrations = await Registration.find(query)
      .populate('form', 'slug college')
      .sort({ createdAt: -1 });
    
    // Convert to Excel format using Excel4Node or similar library
    // For this implementation, we'll just return a JSON response indicating success
    // In a real implementation, you would generate the Excel file and send it
    res.json({
      success: true,
      message: 'Excel export functionality would be implemented with Excel4Node or similar library',
      recordCount: registrations.length
    });
  } catch (error) {
    console.error('Excel Export error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};