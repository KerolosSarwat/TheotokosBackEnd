const { db } = require('../config/firebase-config');

/**
 * Get paginated & filtered audit logs from Realtime Database.
 * Query params: page, limit, module, action, userId, from, to
 */
const getAuditLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 25,
            module,
            action,
            userId,
            from,
            to
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        // Fetch all audit logs ordered by timestamp descending
        const snapshot = await db.ref('auditLogs').orderByChild('timestamp').once('value');
        const rawData = snapshot.val();

        if (!rawData) {
            return res.status(200).json({
                logs: [],
                pagination: { page: pageNum, limit: limitNum, totalCount: 0, totalPages: 0 }
            });
        }

        // Convert to array and add the push key as `id`
        let logs = Object.entries(rawData).map(([id, data]) => ({ id, ...data }));

        // Sort by timestamp descending (newest first)
        logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        // Apply filters
        if (module) {
            logs = logs.filter(log => log.module === module);
        }
        if (action) {
            logs = logs.filter(log => log.action === action);
        }
        if (userId) {
            logs = logs.filter(log => log.performedBy?.uid === userId);
        }
        if (from) {
            logs = logs.filter(log => log.timestamp >= from);
        }
        if (to) {
            const toDate = to.length === 10 ? `${to}T23:59:59.999Z` : to;
            logs = logs.filter(log => log.timestamp <= toDate);
        }

        const totalCount = logs.length;

        // Apply pagination
        const offset = (pageNum - 1) * limitNum;
        const paginatedLogs = logs.slice(offset, offset + limitNum);

        return res.status(200).json({
            logs: paginatedLogs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalCount,
                totalPages: Math.ceil(totalCount / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Export audit logs as JSON (no pagination, respects same filters).
 * Capped at 5000 records for safety.
 */
const exportAuditLogs = async (req, res) => {
    try {
        const { module, action, userId, from, to } = req.query;

        const snapshot = await db.ref('auditLogs').orderByChild('timestamp').once('value');
        const rawData = snapshot.val();

        if (!rawData) {
            return res.status(200).json({ logs: [], totalExported: 0 });
        }

        let logs = Object.entries(rawData).map(([id, data]) => ({ id, ...data }));

        // Sort by timestamp descending
        logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        // Apply filters
        if (module) {
            logs = logs.filter(log => log.module === module);
        }
        if (action) {
            logs = logs.filter(log => log.action === action);
        }
        if (userId) {
            logs = logs.filter(log => log.performedBy?.uid === userId);
        }
        if (from) {
            logs = logs.filter(log => log.timestamp >= from);
        }
        if (to) {
            const toDate = to.length === 10 ? `${to}T23:59:59.999Z` : to;
            logs = logs.filter(log => log.timestamp <= toDate);
        }

        // Cap at 5000
        const exportedLogs = logs.slice(0, 5000);

        return res.status(200).json({ logs: exportedLogs, totalExported: exportedLogs.length });
    } catch (error) {
        console.error('Error exporting audit logs:', error);
        return res.status(500).json({ error: error.message });
    }
};

module.exports = { getAuditLogs, exportAuditLogs };
