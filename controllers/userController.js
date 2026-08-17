// const { use } = require('react');
const { db, admin, auth, firestore } = require('../config/firebase-config');
const { invalidateAttendanceCache } = require('../utils/cache');
const { logAuditEvent } = require('../utils/auditLogger');

// Get all users (from Firestore)
const getAllUsers = async (req, res) => {
  try {
    const usersSnapshot = await firestore.collection('users').get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ message: 'No users found' });
    }

    // Return as object keyed by code (same shape as before for backward compat)
    const users = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.is_deleted) {
        users[doc.id] = { ...data, code: doc.id };
      }
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get soft-deleted users (from Firestore)
const getDeletedUsers = async (req, res) => {
  try {
    const usersSnapshot = await firestore.collection('users').where('is_deleted', '==', true).get();

    const users = {};
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach(doc => {
        users[doc.id] = { ...doc.data(), code: doc.id };
      });
    }

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error getting deleted users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get pending users (from Realtime Database)
const getpenddingUsers = async (req, res) => {
  try {
    const snapshot = await db.ref('penddingUsers').once('value');
    const data = snapshot.val();

    if (!data) {
      return res.status(404).json({ message: 'No users found' });
    }

    const users = {};
    Object.keys(data).forEach(key => {
      users[key] = { ...data[key], code: key };
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get user by code (from Firestore or Realtime DB for pending)
const getUserByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { type } = req.query; // Check for type=pending

    if (type === 'pending') {
      const snapshot = await db.ref(`penddingUsers/${code}`).once('value');
      const data = snapshot.val();
      
      if (!data) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      return res.status(200).json({ ...data, code });
    }

    const docRef = firestore.collection('users').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = { ...doc.data(), code: doc.id };

    return res.status(200).json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get combined data: users with their attendance
const getUsersAttendance = async (req, res) => {
  try {
    const { level } = req.query;

    // Users from Firestore
    const usersSnapshot = await firestore.collection('users').get();
    // Attendance from Realtime DB
    const attendance = (await db.ref('attendance').once("value")).val();

    if (usersSnapshot.empty) {
      return res.json([]);
    }

    let usersArray = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      usersArray.push({
        id: doc.id,
        code: doc.id,
        fullName: data.fullName,
        level: data.level,
        church: data.church,
        birthdate: data.birthdate,
        gender: data.gender,
        address: data.address,
        phoneNumber: data.phoneNumber
      });
    });

    // Filter by level if provided
    if (level && level !== 'all') {
      usersArray = usersArray.filter(user => user.level === level);
    }

    // Combine users with their attendance data
    const report = usersArray.map(user => {
      let studentAttendance = [];

      if (attendance && attendance[user.code]) {
        // Create clean attendance objects
        studentAttendance = Object.keys(attendance[user.code]).map(key => {
          const record = attendance[user.code][key];
          return {
            id: key,
            date: record.date,
            status: record.status,
            term: record.term
          };
        });

        // Sort attendance by date (newest first)
        studentAttendance.sort((a, b) => new Date(b.date) - new Date(a.date));
      }

      // Return clean user object with attendance
      return {
        ...user,
        attendance: studentAttendance
      };
    });

    console.log(`Generated report for ${report.length} students`);
    res.json(report);

  } catch (error) {
    console.error('Error generating report:', error.message);
    res.status(500).json({
      error: 'Failed to generate report',
      details: error.message
    });
  }
};

// Create new user (into users in Firestore)
const createUser = async (req, res) => {
  try {
    const userData = req.body;
    console.log(userData.code + " " + userData.fullName)
    // Validate required fields
    if (!userData.code || !userData.fullName) {
      return res.status(400).json({ message: 'Code and fullName are required fields' });
    }
    console.log(userData)
    // Check if user already exists
    const docRef = firestore.collection('users').doc(userData.code);
    const doc = await docRef.get();

    if (doc.exists) {
      return res.status(409).json({ message: 'User with this code already exists' });
    }

    // Remove degree from user data — degrees go into academicRecords subcollection
    const { degree, ...userDataWithoutDegree } = userData;

    // Create user with the provided code as the document ID
    await docRef.set(userDataWithoutDegree);

    await logAuditEvent(req, {
      action: 'CREATE_USER',
      module: 'users',
      targetId: userData.code,
      details: { fullName: userData.fullName, level: userData.level }
    });

    return res.status(201).json({ message: 'User created successfully', user: userDataWithoutDegree });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update user (in Firestore)
const updateUser = async (req, res) => {
  try {
    const { code } = req.params;
    const { type } = req.query; // Check for type=pending
    const userData = req.body;

    // BULK UPDATE: If userData is an array
    if (Array.isArray(userData)) {
      const results = {
        successful: [],
        failed: []
      };

      for (const user of userData) {
        try {
          if (!user.code) {
            results.failed.push({ user, error: 'Missing user code' });
            continue;
          }
          console.log(user.code);
          const docRef = firestore.collection('users').doc(user.code);
          const doc = await docRef.get();
          console.log(user.code);

          if (!doc.exists) {
            results.failed.push({ user, error: 'User not found' });
            continue;
          }

          const { code: userCode, ...updateData } = user;
          // Remove degree from bulk update — degrees are in subcollection
          const { degree, ...cleanUpdateData } = updateData;
          await docRef.update(cleanUpdateData);

          const updatedDoc = await docRef.get();
          results.successful.push({
            code: user.code,
            user: updatedDoc.data()
          });
        } catch (error) {
          results.failed.push({ user, error: error.message });
        }
      }

      await logAuditEvent(req, {
        action: 'BULK_UPDATE_USERS',
        module: 'users',
        targetId: null,
        details: { successCount: results.successful.length, failedCount: results.failed.length }
      });

      return res.status(200).json({
        message: `Bulk update completed. Successful: ${results.successful.length}, Failed: ${results.failed.length}`,
        results
      });
    }

    // SINGLE UPDATE
    if (type === 'pending') {
      const ref = db.ref(`penddingUsers/${code}`);
      const snapshot = await ref.once('value');
      
      if (!snapshot.exists()) {
        return res.status(404).json({ message: 'User not found' });
      }

      const { degree, ...cleanUserData } = userData;
      await ref.update(cleanUserData);
      
      const updatedSnapshot = await ref.once('value');

      await logAuditEvent(req, {
        action: 'UPDATE_USER',
        module: 'users',
        targetId: code,
        details: { updatedFields: Object.keys(cleanUserData) }
      });

      return res.status(200).json({
        message: 'User updated successfully',
        user: updatedSnapshot.val()
      });
    }

    const docRef = firestore.collection('users').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove degree from updates — degrees go into academicRecords subcollection
    const { degree, ...cleanUserData } = userData;
    await docRef.update(cleanUserData);

    const updatedDoc = await docRef.get();

    await logAuditEvent(req, {
      action: 'UPDATE_USER',
      module: 'users',
      targetId: code,
      details: { updatedFields: Object.keys(cleanUserData) }
    });

    return res.status(200).json({
      message: 'User updated successfully',
      user: updatedDoc.data()
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete user (Soft Delete)
const deleteUser = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists
    const docRef = firestore.collection('users').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Perform soft delete
    await docRef.update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });

    await logAuditEvent(req, {
      action: 'SOFT_DELETE_USER',
      module: 'users',
      targetId: code,
      details: { fullName: doc.data().fullName }
    });

    return res.status(200).json({ message: 'User moved to trash successfully' });
  } catch (error) {
    console.error('Error soft deleting user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Permanently delete user (from Firestore, including subcollections)
const permanentlyDeleteUser = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists
    const docRef = firestore.collection('users').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete academicRecords subcollection first
    const academicRecordsSnapshot = await docRef.collection('academicRecords').get();
    const batch = firestore.batch();
    academicRecordsSnapshot.forEach(subDoc => {
      batch.delete(subDoc.ref);
    });
    // Delete the user document itself
    batch.delete(docRef);
    await batch.commit();

    await logAuditEvent(req, {
      action: 'PERMANENT_DELETE_USER',
      module: 'users',
      targetId: code,
      details: { fullName: doc.data().fullName }
    });

    return res.status(200).json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Restore user
const restoreUser = async (req, res) => {
  try {
    const { code } = req.params;

    const docRef = firestore.collection('users').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    await docRef.update({
      is_deleted: admin.firestore.FieldValue.delete(),
      deleted_at: admin.firestore.FieldValue.delete()
    });

    await logAuditEvent(req, {
      action: 'RESTORE_USER',
      module: 'users',
      targetId: code,
      details: { fullName: doc.data().fullName }
    });

    return res.status(200).json({ message: 'User restored successfully' });
  } catch (error) {
    console.error('Error restoring user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Purge soft-deleted users older than 30 days
const purgeTrash = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usersSnapshot = await firestore.collection('users').where('is_deleted', '==', true).get();

    if (usersSnapshot.empty) {
      return res.status(200).json({ message: 'No deleted users found in trash' });
    }

    const batch = firestore.batch();
    let purgedCount = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const deletedAtStr = userData.deleted_at;
      
      if (deletedAtStr) {
        const deletedAt = new Date(deletedAtStr);
        if (deletedAt < thirtyDaysAgo) {
          // Add to batch delete
          const docRef = doc.ref;
          
          // Must delete subcollections first
          const academicRecordsSnapshot = await docRef.collection('academicRecords').get();
          academicRecordsSnapshot.forEach(subDoc => {
            batch.delete(subDoc.ref);
          });

          batch.delete(docRef);
          purgedCount++;
        }
      }
    }

    if (purgedCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({ message: `Purged ${purgedCount} users from trash` });
  } catch (error) {
    console.error('Error purging trash:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete pending user (from Realtime Database)
const deletePenddingUser = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists in pendingUsers
    const ref = db.ref(`penddingUsers/${code}`);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Pending user not found' });
    }

    // Delete user
    await ref.remove();

    return res.status(200).json({ message: 'Pending user deleted successfully' });
  } catch (error) {
    console.error('Error deleting pending user:', error);
    return res.status(500).json({ error: error.message });
  }
};

const bulkDeleteUsers = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Missing or invalid userIds array' });
    }

    const batches = [];
    let currentBatch = firestore.batch();
    let currentBatchSize = 0;

    const deletedAt = new Date().toISOString();

    for (const code of userIds) {
      const userRef = firestore.collection('users').doc(code);
      currentBatch.update(userRef, { 
        is_deleted: true,
        deleted_at: deletedAt
      });
      currentBatchSize++;

      if (currentBatchSize === 500) {
        batches.push(currentBatch.commit());
        currentBatch = firestore.batch();
        currentBatchSize = 0;
      }
    }

    if (currentBatchSize > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);

    await logAuditEvent(req, {
      action: 'BULK_SOFT_DELETE_USERS',
      module: 'users',
      targetId: null,
      details: { count: userIds.length, userIds }
    });

    return res.status(200).json({ message: `Successfully soft-deleted ${userIds.length} users` });
  } catch (error) {
    console.error('Error bulk deleting users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// API endpoint to send notifications
const sendNotification = async (req, res) => {
  try {
    const { title, body } = req.body;

    // Send to all devices (you'd fetch tokens from DB in real scenario)
    const message = {
      // to: 'all',
      notification: { title, body },

      //topic: 'all' // Send to all subscribed devices
      topic: "all_users"
    };

    const response = await admin.messaging().send(message);
    // console.log(response);
    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Notification failed' });
  }
};

// Approve user: Move from RTDB penddingUsers to Firestore users
const approveUser = async (req, res) => {
  try {
    const { code } = req.params;

    // 1. Get user from RTDB penddingUsers
    const pendingRef = db.ref(`penddingUsers/${code}`);
    const pendingSnapshot = await pendingRef.once('value');

    if (!pendingSnapshot.exists()) {
      return res.status(404).json({ message: 'Pending user not found' });
    }

    const userData = pendingSnapshot.val();

    // 2. Add to users collection in Firestore
    const userDocRef = firestore.collection('users').doc(code);
    await userDocRef.set({
      ...userData,
      code: code
    });
    
    // 3. Remove from RTDB
    await pendingRef.remove();

    await logAuditEvent(req, {
      action: 'APPROVE_USER',
      module: 'users',
      targetId: code,
      details: { fullName: userData.fullName }
    });

    return res.status(200).json({ message: 'User approved successfully', user: userData });
  } catch (error) {
    console.error('Error approving user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Sync Portal User (called on login/register) — stays in Realtime DB
const syncPortalUser = async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.body;

    if (!uid) {
      return res.status(400).json({ message: 'UID is required' });
    }

    const userRef = db.ref(`portalUsers/${uid}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      // Create new portal user with default permissions
      const initialData = {
        uid,
        email,
        displayName,
        photoURL,
        role: 'staff', // Default role
        permissions: {
          users: { view: true, edit: false, delete: false },
          attendance: { view: true, edit: false, delete: false },
          content: { view: true, edit: false, delete: false }
        },
        createdAt: new Date().toISOString()
      };
      await userRef.set(initialData);
      return res.status(201).json({ message: 'Portal user created', user: initialData });
    } else {
      // Update basic info but keep permissions/role intact
      await userRef.update({
        email,
        displayName,
        photoURL,
        lastLogin: new Date().toISOString()
      });
      const updatedUser = (await userRef.once('value')).val();
      return res.status(200).json({ message: 'Portal user synced', user: updatedUser });
    }
  } catch (error) {
    console.error('Error syncing portal user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get all Portal Users — stays in Realtime DB
const getPortalUsers = async (req, res) => {
  try {
    const usersRef = db.ref('portalUsers');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val(); // Returns object with UIDs as keys

    if (!users) {
      return res.status(200).json([]);
    }

    // Convert to array
    const usersArray = Object.values(users);
    return res.status(200).json(usersArray);
  } catch (error) {
    console.error('Error getting portal users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update Portal User Permissions/Role — stays in Realtime DB
const updatePortalUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const { role, permissions } = req.body;

    const userRef = db.ref(`portalUsers/${uid}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Portal user not found' });
    }

    const updates = {};
    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;

    await userRef.update(updates);

    // Return updated user
    const updatedUser = (await userRef.once('value')).val();

    await logAuditEvent(req, {
      action: 'UPDATE_PORTAL_USER_PERMISSIONS',
      module: 'portal_users',
      targetId: uid,
      details: { updatedRole: role || null, updatedPermissions: permissions || null }
    });

    return res.status(200).json({ message: 'Portal user updated', user: updatedUser });
  } catch (error) {
    console.error('Error updating portal user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Reset Password via Phone OTP
const resetPasswordByPhone = async (req, res) => {
  try {
    const { idToken, newPassword } = req.body;

    if (!idToken || !newPassword) {
      return res.status(400).json({ message: 'ID token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Verify the ID token from phone authentication
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const phone = decodedToken.phone_number;

    if (!phone) {
      return res.status(400).json({ message: 'Token does not contain a phone number' });
    }

    // Find the portal user associated with this phone number
    // First, check if this phone-auth UID is linked to a portal user
    const portalUserRef = db.ref('portalUsers');
    const snapshot = await portalUserRef.once('value');
    const portalUsers = snapshot.val();

    let targetUid = null;

    if (portalUsers) {
      // Look for a portal user with a matching phone number or the same UID
      for (const [pUid, pUser] of Object.entries(portalUsers)) {
        if (pUid === uid || pUser.phoneNumber === phone) {
          targetUid = pUid;
          break;
        }
      }
    }

    // If no portal user found, try to find Firebase Auth user by phone
    if (!targetUid) {
      try {
        const userByPhone = await admin.auth().getUserByPhoneNumber(phone);
        targetUid = userByPhone.uid;
      } catch (e) {
        // No user found with this phone number
      }
    }

    if (!targetUid) {
      return res.status(404).json({ message: 'No account found linked to this phone number' });
    }

    // Update the password for the target user
    await admin.auth().updateUser(targetUid, { password: newPassword });

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password by phone:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ message: 'Verification expired. Please try again.' });
    }
    return res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// Admin Reset Staff Password
const adminResetPassword = async (req, res) => {
  try {
    const { targetUid, newPassword } = req.body;

    if (!targetUid || !newPassword) {
      return res.status(400).json({ message: 'Target UID and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // The caller's identity is already verified by verifyToken middleware
    // and permission checked by checkPermission middleware
    // Just update the target user's password
    await admin.auth().updateUser(targetUid, { password: newPassword });

    await logAuditEvent(req, {
      action: 'ADMIN_RESET_PASSWORD',
      module: 'portal_users',
      targetId: targetUid,
      details: null
    });

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting staff password:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ message: 'User not found in Firebase Auth' });
    }
    return res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// Helper: Get current academic year from config
const getCurrentAcademicYear = async () => {
  const configSnapshot = await db.ref('config/academicYear').once('value');
  return configSnapshot.val() || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
};

// Mark Quick Attendance (writes to Firestore subcollection)
const markAttendance = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists in Firestore
    const userDoc = await firestore.collection('users').doc(code).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();

    // Fetch active term and config from Realtime DB
    const configSnapshot = await db.ref('config').once('value');
    const config = configSnapshot.val();
    const activeTerm = config?.terms?.current_term || 1;
    const academicYear = config?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // Map term number to degree key and config key
    const termKeyMap = { 1: 'firstTerm', 2: 'secondTerm', 3: 'thirdTerm' };
    const termConfigKeyMap = { 1: 'first_term', 2: 'second_term', 3: 'third_term' };
    const termKey = termKeyMap[activeTerm] || 'firstTerm';
    const termConfigKey = termConfigKeyMap[activeTerm] || 'first_term';

    // Get attendance degree config: total attendance degree and sessions per term
    const totalAttendanceDegree = Number(config?.degrees?.attendance) || 0;
    const sessionsPerTerm = Number(config?.terms?.[termConfigKey]?.week_count) || 1; // default 1 to avoid division by zero
    const degreePerSession = totalAttendanceDegree / sessionsPerTerm;

    // Prepare attendance record
    const now = new Date();
    // format YYYY-MM-DD HH:mm
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const attendanceRecord = {
      date: dateStr,
      status: "تم الحضور",
      term: activeTerm,
      academicYear: academicYear,
      // Denormalized fields to allow efficient filtering without reading all user documents
      code: userData.code || code,
      fullName: userData.fullName || '',
      level: userData.level || ''
    };

    // Add to Firestore subcollection: users/{code}/attendance/{auto-id}
    const attendanceRef = firestore.collection('users').doc(code).collection('attendance');
    await attendanceRef.add(attendanceRecord);

    // Count total attendance records for the active term from Firestore subcollection using count() to save reads
    const termAttendanceQuery = attendanceRef
      .where('term', '==', activeTerm)
      .where('academicYear', '==', academicYear);
      
    const countSnapshot = await termAttendanceQuery.count().get();
    const termAttendanceCount = countSnapshot.data().count;

    // Calculate attendance degree: attended_sessions × degree_per_session
    // Round to 2 decimal places, then cap at the max attendance degree
    const calculatedAttendanceDegree = Math.min(
      Math.round(termAttendanceCount * degreePerSession * 100) / 100,
      totalAttendanceDegree
    );

    // Sync into Firestore: users/{code}/academicRecords/{academicYear}
    const academicRecordRef = firestore
      .collection('users').doc(code)
      .collection('academicRecords').doc(academicYear);

    const academicRecordDoc = await academicRecordRef.get();
    const currentRecord = academicRecordDoc.exists ? academicRecordDoc.data() : {};
    const currentTermData = currentRecord[termKey] || {};

    const updatedTermData = {
      ...currentTermData,
      attencance: calculatedAttendanceDegree
    };

    // Recalculate total
    const subjects = ['agbya', 'coptic', 'hymns', 'taks', 'attencance'];
    let total = 0;
    subjects.forEach(sub => {
      total += Number(updatedTermData[sub] || 0);
    });
    updatedTermData.total = Math.round(total * 100) / 100;

    await academicRecordRef.set({
      ...currentRecord,
      academicYear: academicYear,
      level: userData.level || '',
      [termKey]: updatedTermData
    }, { merge: true });

    // Invalidate attendance cache so reports reflect new data
    invalidateAttendanceCache();

    await logAuditEvent(req, {
      action: 'MARK_ATTENDANCE',
      module: 'attendance',
      targetId: code,
      details: { fullName: userData.fullName, date: attendanceRecord.date, term: activeTerm }
    });

    return res.status(200).json({
      message: 'Attendance marked successfully',
      record: attendanceRecord,
      termAttendanceCount,
      attendanceDegree: calculatedAttendanceDegree,
      degreePerSession,
      termKey
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Sync ALL users' attendance counts into their academic records for all terms
const syncAllAttendanceDegrees = async (req, res) => {
  try {
    const termKeyMap = { 1: 'firstTerm', 2: 'secondTerm', 3: 'thirdTerm' };
    const termConfigKeyMap = { 1: 'first_term', 2: 'second_term', 3: 'third_term' };
    const subjects = ['agbya', 'coptic', 'hymns', 'taks', 'attencance'];

    // Fetch config for degree calculation
    const configSnapshot = await db.ref('config').once('value');
    const config = configSnapshot.val();
    const totalAttendanceDegree = Number(config?.degrees?.attendance) || 0;
    const academicYear = config?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // Fetch all attendance data from Realtime DB
    const attendanceSnapshot = await db.ref('attendance').once('value');
    const allAttendance = attendanceSnapshot.val() || {};

    let updatedCount = 0;

    for (const [code, records] of Object.entries(allAttendance)) {
      const recordsArr = Object.values(records);

      // Count attendance records per term number
      const countsByTerm = { 1: 0, 2: 0, 3: 0 };
      recordsArr.forEach(record => {
        const t = Number(record.term);
        if (t >= 1 && t <= 3) {
          countsByTerm[t] = (countsByTerm[t] || 0) + 1;
        }
      });

      // Get the academic record from Firestore
      const academicRecordRef = firestore
        .collection('users').doc(code)
        .collection('academicRecords').doc(academicYear);

      const academicRecordDoc = await academicRecordRef.get();
      const currentRecord = academicRecordDoc.exists ? academicRecordDoc.data() : {};

      // Get user level
      const userDoc = await firestore.collection('users').doc(code).get();
      const userLevel = userDoc.exists ? userDoc.data().level || '' : '';

      // Update each term's degree data
      const updatedRecord = { ...currentRecord, academicYear, level: userLevel };

      for (const [termNum, termKey] of Object.entries(termKeyMap)) {
        const count = countsByTerm[Number(termNum)] || 0;
        const termConfigKey = termConfigKeyMap[Number(termNum)];

        // Calculate degree per session for this term
        const sessionsPerTerm = Number(config?.terms?.[termConfigKey]?.week_count) || 1;
        const degreePerSession = totalAttendanceDegree / sessionsPerTerm;

        // Calculate attendance degree
        const calculatedAttendanceDegree = Math.min(
          Math.round(count * degreePerSession * 100) / 100,
          totalAttendanceDegree
        );

        const currentTermData = currentRecord[termKey] || {};
        const updatedTermData = { ...currentTermData, attencance: calculatedAttendanceDegree };

        // Recalculate total
        let total = 0;
        subjects.forEach(sub => { total += Number(updatedTermData[sub] || 0); });
        updatedTermData.total = Math.round(total * 100) / 100;

        updatedRecord[termKey] = updatedTermData;
      }

      await academicRecordRef.set(updatedRecord, { merge: true });
      updatedCount++;
    }

    return res.status(200).json({
      message: `Synced attendance degrees for ${updatedCount} students successfully.`
    });
  } catch (error) {
    console.error('Error syncing attendance degrees:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Bulk delete degree data for selected users
const bulkDeleteDegrees = async (req, res) => {
  try {
    const { codes, academicYear } = req.body; // array of user codes + optional academic year

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ message: 'codes must be a non-empty array' });
    }

    const results = { successful: [], failed: [] };

    for (const code of codes) {
      try {
        const userDocRef = firestore.collection('users').doc(code);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
          results.failed.push({ code, error: 'User not found' });
          continue;
        }

        if (academicYear) {
          // Delete specific academic year record
          await userDocRef.collection('academicRecords').doc(academicYear).delete();
        } else {
          // Delete all academic records
          const academicRecordsSnapshot = await userDocRef.collection('academicRecords').get();
          const batch = firestore.batch();
          academicRecordsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
        results.successful.push(code);
      } catch (err) {
        results.failed.push({ code, error: err.message });
      }
    }

    return res.status(200).json({
      message: `Bulk delete complete. Deleted: ${results.successful.length}, Failed: ${results.failed.length}`,
      results
    });
  } catch (error) {
    console.error('Error in bulk delete degrees:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// Academic Records — Subcollection Endpoints
// ==========================================

// Get all academic records for a user
const getAcademicRecords = async (req, res) => {
  try {
    const { code } = req.params;

    const userDoc = await firestore.collection('users').doc(code).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const snapshot = await firestore
      .collection('users').doc(code)
      .collection('academicRecords')
      .orderBy('academicYear', 'desc')
      .get();

    const records = [];
    snapshot.forEach(doc => {
      records.push({ id: doc.id, ...doc.data() });
    });

    return res.status(200).json(records);
  } catch (error) {
    console.error('Error getting academic records:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get a specific academic record for a user
const getAcademicRecord = async (req, res) => {
  try {
    const { code, year } = req.params;

    const docRef = firestore
      .collection('users').doc(code)
      .collection('academicRecords').doc(year);

    const doc = await docRef.get();

    if (!doc.exists) {
      // Return empty default record instead of 404 so the frontend can work with it
      return res.status(200).json({
        academicYear: year,
        level: '',
        firstTerm: { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 },
        secondTerm: { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 },
        thirdTerm: { agbya: 0, coptic: 0, hymns: 0, taks: 0, attencance: 0, total: 0 }
      });
    }

    return res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error('Error getting academic record:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update (or create) a specific academic record for a user
const updateAcademicRecord = async (req, res) => {
  try {
    const { code, year } = req.params;
    const data = req.body;

    // Check user exists
    const userDoc = await firestore.collection('users').doc(code).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const docRef = firestore
      .collection('users').doc(code)
      .collection('academicRecords').doc(year);

    // Set with merge to preserve existing fields
    await docRef.set({
      ...data,
      academicYear: year,
      level: data.level || userDoc.data().level || ''
    }, { merge: true });

    const updatedDoc = await docRef.get();

    return res.status(200).json({
      message: 'Academic record updated successfully',
      record: { id: updatedDoc.id, ...updatedDoc.data() }
    });
  } catch (error) {
    console.error('Error updating academic record:', error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllUsers,
  getpenddingUsers,
  getUserByCode,
  getUsersAttendance,
  markAttendance,
  syncAllAttendanceDegrees,
  createUser,
  updateUser,
  deleteUser,
  deletePenddingUser,
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
};
