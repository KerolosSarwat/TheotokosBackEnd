// const { use } = require('react');
const { db, admin } = require('../config/firebase-config');

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
    const userRef = db.ref(`users/${code}`);
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
            dateTime: record.dateTime,
            status: record.status,
            studentId: record.studentId
          };
        });

        // Sort attendance by date (newest first)
        studentAttendance.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
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

    // SINGLE UPDATE: Original logic
    const userRef = db.ref(`users/${code}`);
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

module.exports = {
  getAllUsers,
  getpenddingUsers,
  getUserByCode,
  getUsersAttendance,
  createUser,
  updateUser,
  deleteUser,
  sendNotification,
  approveUser,
  syncPortalUser,
  getPortalUsers,
  updatePortalUser
};
