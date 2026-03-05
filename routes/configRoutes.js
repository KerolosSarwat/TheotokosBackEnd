const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Get system configuration
router.get('/', configController.getConfig);

// Update system configuration
router.patch('/', configController.updateConfig);

module.exports = router;
