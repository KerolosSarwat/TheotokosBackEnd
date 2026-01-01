const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    getpenddingUsers,
    getUserByCode,
    createUser,
    updateUser,
    deleteUser,
    getUsersAttendance,
    sendNotification,
    approveUser,
    syncPortalUser,
    getPortalUsers,
    updatePortalUser
} = require('../controllers/userController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get all users
router.get('/', getAllUsers);

// Get pending users
router.get('/pendding', getpenddingUsers);

// Get attendance report
router.get('/attendance-report', getUsersAttendance);

// Get user by code
router.get('/:code', getUserByCode);

// Create new user
router.post('/', verifyToken, checkPermission('users', 'edit'), createUser);

// Update user (Single and Bulk)
router.put('/:code', verifyToken, checkPermission('users', 'edit'), updateUser);
router.post('/bulk-update', verifyToken, checkPermission('users', 'edit'), updateUser);

// Delete user
router.delete('/:code', verifyToken, checkPermission('users', 'delete'), deleteUser);

// Send Notifications
router.post('/send-notification', sendNotification);

// Approve User
router.post('/approve/:code', verifyToken, checkPermission('users', 'edit'), approveUser);

// Portal User Management
router.post('/portal/sync', syncPortalUser);
router.get('/portal/users', getPortalUsers);
router.put('/portal/users/:uid', updatePortalUser);

module.exports = router;
