const express = require('express');
const router = express.Router();
const {
  uploadFile,
  getUserFiles,
  getAllFiles,
  getFileById,
  downloadOutputFile,
  deleteFile,
  getConversionDashboardFiles,
  getConversionRecords,
  getConversionStats,
  launchEditor,
  finalizeFile,
  webhookComplete
} = require('../controllers/fileController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

// Webhook endpoint (no auth - called by external editors)
// External editors call this when user saves/completes editing
router.post('/webhook/complete', webhookComplete);

// All other routes require authentication
router.use(authenticate);

// File upload route - accepts main file and optional metadata file
router.post('/upload', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'metadataFile', maxCount: 1 }
]), handleMulterError, uploadFile);

// Get user's files
router.get('/', getUserFiles);


router.get('/conversion-dashboard', authorizeAdmin, getConversionDashboardFiles);

// Get conversion records (Admin only) - new MongoDB-based tracking
router.get('/conversion-records', authorizeAdmin, getConversionRecords);

// Get conversion statistics (Admin only)
router.get('/conversion-stats', authorizeAdmin, getConversionStats);

// Get all files (Admin only)
router.get('/all', authorizeAdmin, getAllFiles);

// Get file by ID
router.get('/:id', getFileById);

// Download output file
router.get('/:id/download/:fileName', downloadOutputFile);

// Delete file
router.delete('/:id', deleteFile);

// Editor endpoints (for external API integration)
router.post('/:id/editor', launchEditor);
router.post('/:id/finalize', finalizeFile);

module.exports = router;
