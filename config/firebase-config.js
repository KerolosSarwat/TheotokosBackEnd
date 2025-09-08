// const admin = require('firebase-admin');
// const dotenv = require('dotenv');

// dotenv.config();

// // Initialize Firebase Admin SDK
// // In production, you would use environment variables or a service account key file
// // For this example, we'll use a placeholder that the user will need to replace
// const serviceAccount = {
//   // This is a placeholder. In production, you would use:
//   // type: process.env.FIREBASE_TYPE,
//   // project_id: process.env.FIREBASE_PROJECT_ID,
//   // private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
//   // private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
//   // client_email: process.env.FIREBASE_CLIENT_EMAIL,
//   // client_id: process.env.FIREBASE_CLIENT_ID,
//   // auth_uri: process.env.FIREBASE_AUTH_URI,
//   // token_uri: process.env.FIREBASE_TOKEN_URI,
//   // auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
//   // client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
// };


// // Initialize the app
// let firebaseApp;
// try {
//   // Check if app is already initialized
//   firebaseApp = admin.app();
// } catch (error) {
//   // Initialize the app if not already initialized
//   firebaseApp = admin.initializeApp({
//     // In production, you would use:
//     // credential: admin.credential.cert(serviceAccount),
//     // For development, we'll use the database URL directly
//     databaseURL: "https://theotokosmobileapp-default-rtdb.firebaseio.com"
//   });
// }

// // Get database and firestore references
// const db = admin.database();
// const firestore = admin.firestore();

// module.exports = {
//   admin,
//   db,
//   firestore
// };


const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID || 'theotokosmobileapp',
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
  token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

// Initialize the app
let firebaseApp;
try {
  firebaseApp = admin.app();
} catch (error) {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://theotokosmobileapp-default-rtdb.firebaseio.com",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "theotokosmobileapp.appspot.com"
  });
}

// Get database and firestore references
const db = admin.database();
const firestore = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();
const messages = admin.messaging();

module.exports = {
  admin,
  db,
  firestore,
  auth,
  storage,
  messages
};