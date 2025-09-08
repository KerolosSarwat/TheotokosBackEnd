const { firestore } = require('../config/firebase-config');

// Get all documents from a collection
const getAllDocuments = async (req, res) => {
  try {
    const { collection } = req.params;
    
    // Validate collection name
    const validCollections = ['agbya', 'taks', 'coptic', 'hymns', 'test'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({ 
        message: 'Invalid collection. Must be one of: agbya, taks, coptic, hymns' 
      });
    }
    
    const collectionRef = firestore.collection(collection);
    const snapshot = await collectionRef.get();
    
    if (snapshot.empty) {
      return res.status(404).json({ message: `No documents found in ${collection} collection` });
    }
    
    const documents = [];
    snapshot.forEach(doc => {
      documents.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return res.status(200).json(documents);
  } catch (error) {
    console.error(`Error getting documents from collection:`, error);
    return res.status(500).json({ error: error.message });
  }
};

// Get document by ID from a collection
const getDocumentById = async (req, res) => {
  try {
    const { collection, docId } = req.params;
    
    // Validate collection name
    const validCollections = ['agbya', 'taks', 'coptic', 'hymns', 'test'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({ 
        message: 'Invalid collection. Must be one of: agbya, taks, coptic, hymns' 
      });
    }
    
    const docRef = firestore.collection(collection).doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        message: `Document with ID ${docId} not found in ${collection} collection` 
      });
    }
    
    return res.status(200).json({
      id: doc.id,
      ...doc.data()
    });
  } catch (error) {
    console.error('Error getting document:', error);
    return res.status(500).json({ error: error.message });
  }
};
// Add a new document to a collection
const addDocument = async (req, res) => {
  try {
    const { collection } = req.params;
    const data = req.body;
    
    // Validate collection name
    const validCollections = ['agbya', 'taks', 'coptic', 'hymns', 'test'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({ 
        message: 'Invalid collection. Must be one of: agbya, taks, coptic, hymns' 
      });
    }
    
    // Collection-specific validation
    if (collection === 'agbya') {
      if (!Array.isArray(data.ageLevel) || !data.ageLevel.every(Number.isInteger)) {
        return res.status(400).json({ error: 'ageLevel must be an array of integers' });
      }
      if (typeof data.content !== 'string') {
        return res.status(400).json({ error: 'content must be a string' });
      }
      if (typeof data.description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      if (!Number.isInteger(data.term)) {
        return res.status(400).json({ error: 'term must be an integer' });
      }
      if (typeof data.title !== 'string') {
        return res.status(400).json({ error: 'title must be a string' });
      }
      if (!Number.isInteger(data.yearNumber)) {
        return res.status(400).json({ error: 'yearNumber must be an integer' });
      }
    }
    
    if (collection === 'coptic'){
     var docRef  = await firestore.collection(collection).doc("third_fourthPrimary").collection("firstYear").doc(data.id).set(data);
    }
    else
     docRef = await firestore.collection(collection).add(data);
    
    return res.status(201).json({
      message: 'Document added successfully',
      id: docRef.id,
      data: data
    });
  } catch (error) {
    console.error('Error adding document:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update an existing document
const updateDocument = async (req, res) => {
  try {
    const { collection, docId } = req.params;
    const data = req.body;
    
    // Validate collection name
    const validCollections = ['agbya', 'taks', 'coptic', 'hymns', 'test'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({ 
        message: 'Invalid collection. Must be one of: agbya, taks, coptic, hymns' 
      });
    }
    
    const docRef = firestore.collection(collection).doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        message: `Document with ID ${docId} not found in ${collection} collection` 
      });
    }
    
    // Update only allowed fields and add updatedAt timestamp
    const updateData = {
      ...data
    };
    
    await docRef.update(updateData);
    
    return res.status(200).json({
      message: 'Document updated successfully',
      id: docId,
      data: updateData
    });
  } catch (error) {
    console.error('Error updating document:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete a document
const deleteDocument = async (req, res) => {
  try {
    const { collection, docId } = req.params;
    
    // Validate collection name
    const validCollections = ['agbya', 'taks', 'coptic', 'hymns'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({ 
        message: 'Invalid collection. Must be one of: agbya, taks, coptic, hymns' 
      });
    }
    
    const docRef = firestore.collection(collection).doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: `Document with ID ${docId} not found in ${collection} collection` });
    }
    
    await docRef.delete();
    
    return res.status(200).json({
      message: 'Document deleted successfully',
      id: docId
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllDocuments,
  getDocumentById,
  addDocument,
  updateDocument,
  deleteDocument
};
