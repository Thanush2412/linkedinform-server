const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const { authenticate, isAdmin, canAccessSummary } = require('../middlewares/auth');
const masterDataController = require('../controllers/masterDataController');

// All summary routes are protected
router.use(authenticate);

// Routes accessible to all authenticated users (including regular users)
// Get summary by date (time and YOP data) - accessible to all users
router.get('/by-date', canAccessSummary, summaryController.getSummaryByDate);

// Routes accessible only to admin and superadmin users
// Get summary by college
router.get('/by-college', isAdmin, summaryController.getCollegeSummary);

// Get summary statistics
router.get('/statistics', isAdmin, summaryController.getStatistics);

// Export registration data
router.get('/export', isAdmin, summaryController.exportRegistrations);

// New routes for enhanced features - admin/superadmin only
router.get('/activity-history', isAdmin, summaryController.getSiteActivityHistory);
router.get('/metrics', isAdmin, summaryController.getSiteMetrics);
router.get('/data-metrics', isAdmin, summaryController.getDataMetrics);
router.get('/export-json', isAdmin, summaryController.exportRegistrationsJson);
router.get('/export-excel', isAdmin, summaryController.exportRegistrationsExcel);

// Get registrations API
router.get('/registrations', isAdmin, summaryController.getRegistrations);

// Get registrations by slug and employee number - no auth required for restricted users
router.get('/registrations-by-employee', summaryController.getRegistrationsBySlugAndEmployee);

// Mark attendance API
router.post('/mark-attendance', canAccessSummary, summaryController.markAttendance);

// Master Data endpoints
router.post('/master-data/sync', masterDataController.syncMasterData);
router.get('/master-data', masterDataController.getMasterData);
router.get('/master-data/stats', masterDataController.getMasterDataStats);
router.post('/master-data/sync/:registrationId', masterDataController.syncSingleRegistration);
router.get('/master-data/export-excel', isAdmin, masterDataController.exportMasterDataExcel);

// Add endpoint to get registrations by employee for summary page
router.get('/registrations-by-employee', canAccessSummary, summaryController.getRegistrationsByEmployee);

module.exports = router;