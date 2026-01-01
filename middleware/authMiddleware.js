const { admin, db } = require('../config/firebase-config');

// Middleware to verify Firebase ID Token
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};

// Middleware to check specific permissions
const checkPermission = (module, action) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.uid) {
                return res.status(401).json({ message: 'Unauthorized: User not identified' });
            }

            const uid = req.user.uid;
            const userRef = db.ref(`portalUsers/${uid}`);
            const snapshot = await userRef.once('value');

            if (!snapshot.exists()) {
                // Fallback: If user not in portalUsers but has valid token, maybe allow read-only? 
                // For strict mode: Deny
                return res.status(403).json({ message: 'Forbidden: User profile not found' });
            }

            const userData = snapshot.val();
            const userRole = userData.role;

            // Super Admin and Admin bypass
            if (userRole === 'super_admin' || userRole === 'admin') {
                return next();
            }

            // Check granular permission
            // e.g., permissions.users.edit
            if (
                userData.permissions &&
                userData.permissions[module] &&
                userData.permissions[module][action] === true
            ) {
                return next();
            }

            return res.status(403).json({
                message: `Forbidden: You do not have permission to ${action} ${module}`
            });

        } catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    };
};

module.exports = { verifyToken, checkPermission };
