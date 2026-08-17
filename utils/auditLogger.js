const { db } = require('../config/firebase-config');

/**
 * Log an audit event to the Realtime Database `auditLogs` node.
 *
 * @param {object} req - Express request object (must have req.user from verifyToken middleware)
 * @param {object} options
 * @param {string} options.action - e.g. 'CREATE_USER', 'DELETE_USER', 'UPDATE_PERMISSIONS'
 * @param {string} options.module - e.g. 'users', 'attendance', 'portal_users', 'settings'
 * @param {string} [options.targetId] - The document/user code affected
 * @param {object} [options.details] - Free-form object with extra context (before/after, etc.)
 */
const logAuditEvent = async (req, { action, module, targetId = null, details = null }) => {
    try {
        const performedBy = req.user
            ? {
                uid: req.user.uid || null,
                email: req.user.email || null,
                displayName: req.user.name || req.user.displayName || null
            }
            : { uid: null, email: null, displayName: null };

        const auditEntry = {
            action,
            module,
            performedBy,
            targetId,
            details,
            timestamp: new Date().toISOString(),
            ipAddress: req.ip || req.connection?.remoteAddress || null
        };

        await db.ref('auditLogs').push(auditEntry);
    } catch (error) {
        // Never let audit logging failures break the main flow
        console.error('Audit log error:', error.message);
    }
};

module.exports = { logAuditEvent };
