const { db } = require('../config/firebase-config');

// Get system configuration
const getConfig = async (req, res) => {
    try {
        const configSnapshot = await db.ref('config').once('value');
        const config = configSnapshot.val();

        if (!config) {
            return res.status(404).json({ message: 'Configuration not found' });
        }

        return res.status(200).json(config);
    } catch (error) {
        console.error('Error getting config:', error);
        return res.status(500).json({ error: error.message });
    }
};

// Update system configuration
const updateConfig = async (req, res) => {
    try {
        const data = req.body;

        // We use update() to perform a partial update of the config node
        await db.ref('config').update(data);

        const updatedConfigSnapshot = await db.ref('config').once('value');

        return res.status(200).json({
            message: 'Configuration updated successfully',
            data: updatedConfigSnapshot.val()
        });
    } catch (error) {
        console.error('Error updating config:', error);
        return res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getConfig,
    updateConfig
};
