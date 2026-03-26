const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: false  // Deprecated - kept for backward compatibility
  },
  gridfsInputFileId: {
    type: mongoose.Schema.Types.ObjectId,  // GridFS file reference for input file
    required: false
  },
  storedInGridFS: {
    type: Boolean,
    default: true  // All new files will be stored in GridFS
  },
  fileType: {
    type: String,
    enum: ['pdf', 'epub'],
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  // User-specified output folder path for saving converted files locally
  outputFolderPath: {
    type: String,
    required: false  // Optional: user can specify where to save output files
  },
  // External API integration fields
  externalJobId: {
    type: String,
    required: false,
    index: true  // Index for faster lookups
  },
  externalService: {
    type: String,
    enum: ['pdf', 'epub', 'local'],  // 'local' for legacy backward compatibility
    default: 'local'
  },
  // External API URLs for accessing output files
  externalApiBaseUrl: {
    type: String,
    required: false  // Base URL of the external API for downloading files
  },
  externalLinks: {
    job: String,
    files: String,
    rittdocPackage: String,
    wordDocument: String,
    validationReport: String,
    docbookXml: String
  },
  editorUrl: {
    type: String,
    required: false  // URL to editor when in editing state
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: [
      'uploaded',           // File received, not yet sent to processing
      'pending',            // Sent to external API, waiting to start
      'processing',         // Being processed (extracting, converting, packaging, validating)
      'editing',            // User is editing in web editor (optional post-completion)
      'completed',          // Done - outputs available immediately
      'failed',             // Error occurred
      'cancelled'           // Job was cancelled
    ],
    default: 'uploaded'
  },
  processingStartedAt: {
    type: Date
  },
  processingCompletedAt: {
    type: Date
  },
  outputPath: {
    type: String  // Deprecated - kept for backward compatibility
  },
  outputFiles: [{
    fileName: String,
    filePath: String,  // Deprecated - kept for backward compatibility
    fileType: String,
    fileSize: Number,
    downloadType: String,  // e.g., 'rittdoc_package', 'word_document', 'validation_report', 'docbook_xml'
    gridfsFileId: mongoose.Schema.Types.ObjectId,  // GridFS file reference
    storedInGridFS: {
      type: Boolean,
      default: false
    },
    localPath: String  // Path to locally saved file in user's output folder
  }],
  errorMessage: {
    type: String
  },
  conversionMetadata: {
    conversionType: String,
    outputFormats: [String],
    processingTime: Number,
    isbn: String,
    title: String,
    author: String,
    publisher: String
  }
}, {
  timestamps: true
});

// Index for faster queries
fileSchema.index({ uploadedBy: 1, createdAt: -1 });
fileSchema.index({ status: 1 });
fileSchema.index({ externalJobId: 1, externalService: 1 });  // For external API job lookups

// Method to update processing status
fileSchema.methods.updateStatus = function(status, additionalData = {}) {
  this.status = status;

  if (status === 'processing') {
    this.processingStartedAt = new Date();
  } else if (status === 'completed') {
    this.processingCompletedAt = new Date();
    if (this.processingStartedAt) {
      const processingTime = (this.processingCompletedAt - this.processingStartedAt) / 1000;
      this.conversionMetadata = {
        ...this.conversionMetadata,
        processingTime
      };
    }
  }

  Object.assign(this, additionalData);
  return this.save();
};

module.exports = mongoose.model('File', fileSchema);
