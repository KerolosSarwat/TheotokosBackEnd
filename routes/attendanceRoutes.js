const express = require('express');
const router = express.Router();
const {
  getUserAttendance,
  getAttendanceReport,
  getAttendanceSummary,
  exportAttendance,
  getAcademicYears,
  bulkMarkAttendance
} = require('../controllers/attendanceController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// All routes require authentication and attendance view permission
const authMiddleware = [verifyToken, checkPermission('attendance', 'view')];

// Get available academic years
router.get('/academic-years', ...authMiddleware, getAcademicYears);

// Get attendance summary (dashboard stats)
router.get('/summary', ...authMiddleware, getAttendanceSummary);

// Get detailed attendance report (global)
router.get('/report', ...authMiddleware, getAttendanceReport);

// Export attendance data (all filtered records, no pagination)
router.get('/export', ...authMiddleware, exportAttendance);

// Get attendance for a specific user (must come after specific routes)
router.get('/user/:userId', ...authMiddleware, getUserAttendance);

// Bulk mark attendance
router.post('/bulk-mark', verifyToken, checkPermission('attendance', 'edit'), bulkMarkAttendance);

module.exports = router;
