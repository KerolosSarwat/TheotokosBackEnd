const express = require('express');
const router = express.Router();
const firestoreController = require('../controllers/firestoreController');

// Get all documents from a collection
router.get('/:collection', firestoreController.getAllDocuments);

// Get document by ID from a collection
router.get('/:collection/:docId', firestoreController.getDocumentById);

router.post('/:collection', firestoreController.addDocument);
router.put('/:collection/:docId', firestoreController.updateDocument);
router.delete('/:collection/:docId', firestoreController.deleteDocument);

module.exports = router;
