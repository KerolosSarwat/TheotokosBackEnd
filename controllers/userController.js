// const { use } = require('react');
const { db, admin, auth } = require('../config/firebase-config');

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const usersRef = db.ref('users');

    const snapshot = await usersRef.once('value');
    const users = snapshot.val();
    if (!users) {
      return res.status(404).json({ message: 'No users found' });
    }
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    return res.status(500).json({ error: error.message });
  }
};
const getpenddingUsers = async (req, res) => {
  try {
    const usersRef = db.ref('penddingUsers');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    if (!users) {
      return res.status(404).json({ message: 'No users found' });
    }

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get user by code
const getUserByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { type } = req.query; // Check for type=pending

    let userRef;
    if (type === 'pending') {
      userRef = db.ref(`penddingUsers/${code}`);
    } else {
      userRef = db.ref(`users/${code}`);
    }

    const snapshot = await userRef.once('value');
    const user = snapshot.val();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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

    // const [usersResponse, attendanceResponse] = await Promise.all([
    //   axios.get(`${FIREBASE_URL}/users.json`),
    //   axios.get(`${FIREBASE_URL}/attendance.json`)
    // ]);

    const users = (await db.ref('users').once("value")).val();
    const attendance = (await db.ref('attendance').once("value")).val();
    // Handle case where no data exists
    if (!users) {
      return res.json([]);
    }

    let usersArray = Object.keys(users).map(key => {
      // Create a clean user object without circular references
      return {
        id: key,
        code: users[key].code,
        fullName: users[key].fullName,
        level: users[key].level,
        church: users[key].church,
        birthdate: users[key].birthdate,
        gender: users[key].gender,
        address: users[key].address,
        phoneNumber: users[key].phoneNumber
      };
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

// Create new user
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
    const userRef = db.ref(`penddingUsers/${userData.code}`);
    const snapshot = await userRef.once('value');

    if (snapshot.exists()) {
      return res.status(409).json({ message: 'User with this code already exists' });
    }

    // Create user with the provided code as the key
    await userRef.set(userData);

    return res.status(201).json({ message: 'User created successfully', user: userData });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { code } = req.params;
    const { type } = req.query; // Check for type=pending
    const userData = req.body;

    // BULK UPDATE: If userData is an array
    if (Array.isArray(userData)) {
      // ... (existing bulk update logic remains same, assuming it's for regular users mainly)
      // If needed for pending, logic would be similar but target different node.
      // For now, let's keep bulk update as is or update if necessary.
      // Assuming bulk update is for main list import.

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
          const userRef = db.ref(`users/${user.code}`);
          const snapshot = await userRef.once('value');
          console.log(user.code);

          if (!snapshot.exists()) {
            results.failed.push({ user, error: 'User not found' });
            continue;
          }

          const { code: userCode, ...updateData } = user;
          await userRef.update(updateData);

          const updatedSnapshot = await userRef.once('value');
          results.successful.push({
            code: user.code,
            user: updatedSnapshot.val()
          });
        } catch (error) {
          results.failed.push({ user, error: error.message });
        }
      }

      return res.status(200).json({
        message: `Bulk update completed. Successful: ${results.successful.length}, Failed: ${results.failed.length}`,
        results
      });
    }

    // SINGLE UPDATE: Modified logic
    let userRef;
    if (type === 'pending') {
      userRef = db.ref(`penddingUsers/${code}`);
    } else {
      userRef = db.ref(`users/${code}`);
    }

    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }

    await userRef.update(userData);

    const updatedSnapshot = await userRef.once('value');

    return res.status(200).json({
      message: 'User updated successfully',
      user: updatedSnapshot.val()
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists
    const userRef = db.ref(`users/${code}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete user
    await userRef.remove();

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete pending user
const deletePenddingUser = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists in penddingUsers
    const userRef = db.ref(`penddingUsers/${code}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Pending user not found' });
    }

    // Delete user
    await userRef.remove();

    return res.status(200).json({ message: 'Pending user deleted successfully' });
  } catch (error) {
    console.error('Error deleting pending user:', error);
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

// Approve user: Move from penddingUsers to users
const approveUser = async (req, res) => {
  try {
    const { code } = req.params;

    // 1. Get user from penddingUsers
    const pendingUserRef = db.ref(`penddingUsers/${code}`);
    const snapshot = await pendingUserRef.once('value');
    const userData = snapshot.val();

    if (!userData) {
      return res.status(404).json({ message: 'Pending user not found' });
    }

    // 2. Check if user already exists in main users list to avoid overwrite/duplication issues
    const userRef = db.ref(`users/${code}`);
    const existingUserSnapshot = await userRef.once('value');

    if (existingUserSnapshot.exists()) {
      // Optional: Decide whether to merge, error, or overwrite. 
      // For now, we'll error to be safe, or we could overwrite.
      // Let's overwrite / update since approval might be a "fix" for an existing record too,
      // but typically "pending" implies a new signup.
      // Let's assume we proceed.
    }

    // 3. Save to users node
    await userRef.set(userData);

    // 4. Remove from penddingUsers node
    await pendingUserRef.remove();

    return res.status(200).json({ message: 'User approved successfully', user: userData });
  } catch (error) {
    console.error('Error approving user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Sync Portal User (called on login/register)
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

// Get all Portal Users
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

// Update Portal User Permissions/Role
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

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting staff password:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ message: 'User not found in Firebase Auth' });
    }
    return res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// Mark Quick Attendance
const markAttendance = async (req, res) => {
  try {
    const { code } = req.params;

    // Check if user exists
    const userRef = db.ref(`users/${code}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch active term from config
    const configSnapshot = await db.ref('config').once('value');
    const config = configSnapshot.val();
    const activeTerm = config?.terms?.current_term || 1;

    // Map term number to degree key: 1 -> firstTerm, 2 -> secondTerm, 3 -> thirdTerm
    const termKeyMap = { 1: 'firstTerm', 2: 'secondTerm', 3: 'thirdTerm' };
    const termKey = termKeyMap[activeTerm] || 'firstTerm';

    // Prepare attendance record
    const now = new Date();
    // format YYYY-MM-DD HH:mm
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const attendanceRecord = {
      date: dateStr,
      status: "تم الحضور",
      term: activeTerm
    };

    // Add to attendance/{code}
    const attendanceRef = db.ref(`attendance/${code}`);
    await attendanceRef.push(attendanceRecord);

    // Count total attendance records for the active term
    const allAttendanceSnapshot = await attendanceRef.once('value');
    const allAttendance = allAttendanceSnapshot.val() || {};
    const termAttendanceCount = Object.values(allAttendance).filter(
      record => Number(record.term) === Number(activeTerm)
    ).length;

    // Sync count into users/{code}/degree/{termKey}/attencance
    // Also recalculate total for that term
    const degreeRef = db.ref(`users/${code}/degree/${termKey}`);
    const degreeSnapshot = await degreeRef.once('value');
    const currentDegree = degreeSnapshot.val() || {};

    const updatedDegree = {
      ...currentDegree,
      attencance: termAttendanceCount
    };

    // Recalculate total
    const subjects = ['agbya', 'coptic', 'hymns', 'taks', 'attencance'];
    let total = 0;
    subjects.forEach(sub => {
      total += Number(updatedDegree[sub] || 0);
    });
    updatedDegree.total = total;

    await degreeRef.update(updatedDegree);

    return res.status(200).json({
      message: 'Attendance marked successfully',
      record: attendanceRecord,
      termAttendanceCount,
      termKey
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Sync ALL users' attendance counts into their degree nodes for all terms
const syncAllAttendanceDegrees = async (req, res) => {
  try {
    const termKeyMap = { 1: 'firstTerm', 2: 'secondTerm', 3: 'thirdTerm' };
    const subjects = ['agbya', 'coptic', 'hymns', 'taks', 'attencance'];

    // Fetch all attendance data
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

      // Update each term's degree node
      for (const [termNum, termKey] of Object.entries(termKeyMap)) {
        const count = countsByTerm[Number(termNum)] || 0;
        const degreeRef = db.ref(`users/${code}/degree/${termKey}`);
        const degreeSnapshot = await degreeRef.once('value');
        const currentDegree = degreeSnapshot.val() || {};

        const updatedDegree = { ...currentDegree, attencance: count };

        // Recalculate total
        let total = 0;
        subjects.forEach(sub => { total += Number(updatedDegree[sub] || 0); });
        updatedDegree.total = total;

        await degreeRef.update(updatedDegree);
      }
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
    const { codes } = req.body; // array of user codes

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ message: 'codes must be a non-empty array' });
    }

    const results = { successful: [], failed: [] };

    for (const code of codes) {
      try {
        const userRef = db.ref(`users/${code}`);
        const snapshot = await userRef.once('value');

        if (!snapshot.exists()) {
          results.failed.push({ code, error: 'User not found' });
          continue;
        }

        // Remove only the degree node, keep everything else
        await db.ref(`users/${code}/degree`).remove();
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
  adminResetPassword
};
