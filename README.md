# Firebase Portal - Backend README

## Overview
This is the backend server for the Firebase Portal, which provides API endpoints for CRUD operations on Firebase Realtime Database users and retrieval of Firestore collection data.

## Project Structure
```
/server
├── config/
│   ├── firebase-config.js       # Firebase configuration and initialization
├── controllers/
│   ├── userController.js        # Controllers for user CRUD operations
│   └── firestoreController.js   # Controllers for Firestore data retrieval
├── routes/
│   ├── userRoutes.js            # Routes for user CRUD operations
│   └── firestoreRoutes.js       # Routes for Firestore data retrieval
├── .env.example                 # Example environment variables
└── server.js                    # Main server entry point
```

## API Endpoints

### User Management (Realtime Database)
- `GET /api/users` - Get all users
- `GET /api/users/:code` - Get user by code
- `POST /api/users` - Create a new user
- `PUT /api/users/:code` - Update a user
- `DELETE /api/users/:code` - Delete a user

### Firestore Data
- `GET /api/firestore/:collection` - Get all documents from a collection
- `GET /api/firestore/:collection/:docId` - Get specific document from a collection

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example` and add your Firebase configuration.

3. Start the server:
   ```
   npm start
   ```

## Security Considerations
- In production, use Firebase Admin SDK with proper service account credentials
- Implement authentication middleware for protected routes
- Set up proper Firebase security rules for both Realtime Database and Firestore
