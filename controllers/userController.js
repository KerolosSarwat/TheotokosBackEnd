// const { use } = require('react');
const { db,  admin} = require('../config/firebase-config');

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
          const userRef = db.ref(`penddingUsers/${user.code}`);
          const snapshot = await userRef.once('value');
          
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

module.exports = {
  getAllUsers,
  getpenddingUsers,
  getUserByCode,
  createUser,
  updateUser,
  deleteUser,
  sendNotification
};
