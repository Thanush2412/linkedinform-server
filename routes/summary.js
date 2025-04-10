const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const { authenticate, isAdmin, canAccessSummary } = require('../middlewares/auth');

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

module.exports = router;