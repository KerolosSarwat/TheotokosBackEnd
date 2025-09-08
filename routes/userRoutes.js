const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Get all users
router.get('/', userController.getAllUsers);

//Get the pendding users
router.get('/pendding', userController.getpenddingUsers);

// Get user by code
router.get('/:code', userController.getUserByCode);

// Create new user
router.post('/', userController.createUser);

// Update user
router.put('/:code', userController.updateUser);

router.post('/bulk-update', userController.updateUser);

// router.put('/:code', userController.updateUser);
// Delete user
router.delete('/:code', userController.deleteUser);

// Send Notifications
router.post('/send-notification', userController.sendNotification)

module.exports = router;
