const express = require('express');
const router = express.Router();
const { getAuditLogs, exportAuditLogs } = require('../controllers/auditController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get paginated audit logs
router.get('/', verifyToken, checkPermission('audit_log', 'view'), getAuditLogs);

// Export audit logs
router.get('/export', verifyToken, checkPermission('audit_log', 'view'), exportAuditLogs);

module.exports = router;
