const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    getpenddingUsers,
    getUserByCode,
    createUser,
    updateUser,
    deleteUser,
    deletePenddingUser,
    getUsersAttendance,
    markAttendance,
    syncAllAttendanceDegrees,
    sendNotification,
    approveUser,
    syncPortalUser,
    getPortalUsers,
    updatePortalUser,
    resetPasswordByPhone,
    adminResetPassword,
    bulkDeleteDegrees,
    getAcademicRecords,
    getAcademicRecord,
    updateAcademicRecord,
    getDeletedUsers,
    restoreUser,
    permanentlyDeleteUser,
    purgeTrash,
    bulkDeleteUsers
} = require('../controllers/userController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get all users
router.get('/', getAllUsers);

// Get pending users (must come before /:code)
router.get('/pendding', getpenddingUsers);

// Get attendance report (must come before /:code)
router.get('/attendance-report', getUsersAttendance);

// Mark quick attendance
router.post('/attendance/:code', verifyToken, checkPermission('attendance', 'edit'), markAttendance);

// Sync all attendance counts into degree nodes
router.post('/attendance-sync', verifyToken, checkPermission('attendance', 'edit'), syncAllAttendanceDegrees);

// Portal User Management (must come before /:code)
router.get('/portal/users', getPortalUsers);

// Get soft-deleted users (must come before /:code)
router.get('/trash', verifyToken, checkPermission('users', 'view'), getDeletedUsers);

// Get user by code (parameterized route - should come after specific routes)
router.get('/:code', getUserByCode);

// Academic Records — Subcollection routes (must come before generic /:code PUT/DELETE)
router.get('/:code/academic-records', getAcademicRecords);
router.get('/:code/academic-records/:year', getAcademicRecord);
router.put('/:code/academic-records/:year', verifyToken, checkPermission('degrees', 'edit'), updateAcademicRecord);

// Create new user
router.post('/', verifyToken, checkPermission('users', 'edit'), createUser);

// Approve User (must come before /:code for PUT)
router.post('/approve/:code', verifyToken, checkPermission('users', 'edit'), approveUser);

// Update user (Single and Bulk)
router.put('/:code', verifyToken, checkPermission('users', 'edit'), updateUser);
router.put('/:code/restore', verifyToken, checkPermission('users', 'edit'), restoreUser);
router.post('/bulk-update', verifyToken, checkPermission('users', 'edit'), updateUser);

// Bulk delete users (Soft Delete)
router.post('/bulk-delete', verifyToken, checkPermission('users', 'delete'), bulkDeleteUsers);

// Bulk delete degree data
router.post('/bulk-delete-degrees', verifyToken, checkPermission('users', 'delete'), bulkDeleteDegrees);

// Portal User Management
router.put('/portal/users/:uid', updatePortalUser);

// Delete pending user (must come before /:code)
router.delete('/pendding/:code', verifyToken, checkPermission('users', 'delete'), deletePenddingUser);

// Delete user (Soft Delete)
router.delete('/:code', verifyToken, checkPermission('users', 'delete'), deleteUser);

// Permanently delete user
router.delete('/:code/permanent', verifyToken, checkPermission('users', 'delete'), permanentlyDeleteUser);

// Purge old soft-deleted users
router.delete('/trash/purge', verifyToken, checkPermission('users', 'delete'), purgeTrash);

// Send Notifications
router.post('/send-notification', sendNotification);

// Portal User Management
router.post('/portal/sync', syncPortalUser);

// Reset Password via Phone OTP
router.post('/portal/reset-password-phone', resetPasswordByPhone);

// Admin Reset Staff Password (requires auth)
router.post('/portal/admin-reset-password', verifyToken, adminResetPassword);

module.exports = router;
