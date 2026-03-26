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
  getCostAnalytics,
  getCostSummary,
  launchEditor,
  finalizeFile,
  webhookComplete,
  batchUpload,
  batchDelete,
  batchDownload,
  getBatchStatus,
  getQAReport
} = require('../controllers/fileController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const { upload, batchUpload: batchUploadMiddleware, handleMulterError } = require('../middleware/upload');

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

// Batch operations
router.post('/upload-batch', batchUploadMiddleware.array('files', 20), handleMulterError, batchUpload);
router.delete('/batch', batchDelete);
router.post('/batch-download', batchDownload);
router.get('/batch-status/:batchId', getBatchStatus);

// Get user's files
router.get('/', getUserFiles);


router.get('/conversion-dashboard', authorizeAdmin, getConversionDashboardFiles);

// Get conversion records (Admin only) - new MongoDB-based tracking
router.get('/conversion-records', authorizeAdmin, getConversionRecords);

// Get conversion statistics (Admin only)
router.get('/conversion-stats', authorizeAdmin, getConversionStats);

// Cost analytics (Admin only)
router.get('/cost-analytics', authorizeAdmin, getCostAnalytics);

// Cost summary (Admin only)
router.get('/cost-summary', authorizeAdmin, getCostSummary);

// Get all files (Admin only)
router.get('/all', authorizeAdmin, getAllFiles);

// Get file by ID
router.get('/:id', getFileById);

// Get QA report for a file
router.get('/:id/qa-report', getQAReport);

// Download output file
router.get('/:id/download/:fileName', downloadOutputFile);

// Delete file
router.delete('/:id', deleteFile);

// Editor endpoints (for external API integration)
router.post('/:id/editor', launchEditor);
router.post('/:id/finalize', finalizeFile);

module.exports = router;
