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
    sendNotification,
    approveUser,
    syncPortalUser,
    getPortalUsers,
    updatePortalUser
} = require('../controllers/userController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get all users
router.get('/', getAllUsers);

// Get pending users (must come before /:code)
router.get('/pendding', getpenddingUsers);

// Get attendance report (must come before /:code)
router.get('/attendance-report', getUsersAttendance);

// Portal User Management (must come before /:code)
router.get('/portal/users', getPortalUsers);

// Get user by code (parameterized route - should come after specific routes)
router.get('/:code', getUserByCode);

// Create new user
router.post('/', verifyToken, checkPermission('users', 'edit'), createUser);

// Approve User (must come before /:code for PUT)
router.post('/approve/:code', verifyToken, checkPermission('users', 'edit'), approveUser);

// Update user (Single and Bulk)
router.put('/:code', verifyToken, checkPermission('users', 'edit'), updateUser);
router.post('/bulk-update', verifyToken, checkPermission('users', 'edit'), updateUser);

// Portal User Management
router.put('/portal/users/:uid', updatePortalUser);

// Delete pending user (must come before /:code)
router.delete('/pendding/:code', verifyToken, checkPermission('users', 'delete'), deletePenddingUser);

// Delete user
router.delete('/:code', verifyToken, checkPermission('users', 'delete'), deleteUser);

// Send Notifications
router.post('/send-notification', sendNotification);

// Portal User Management
router.post('/portal/sync', syncPortalUser);

module.exports = router;
