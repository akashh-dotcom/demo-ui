const mongoose = require('mongoose');

/**
 * ConversionRecord Schema
 * Tracks all file conversion operations for reporting and analytics
 */
const conversionRecordSchema = new mongoose.Schema({
  // Reference to the original file
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true,
    index: true
  },

  // File information
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'epub'],
    required: true,
    index: true
  },
  fileSize: {
    type: Number,
    required: true
  },

  // Book metadata (extracted from content)
  isbn: {
    type: String,
    index: true
  },
  title: String,
  author: String,
  publisher: String,

  // Processing information
  externalJobId: {
    type: String,
    index: true
  },
  externalService: {
    type: String,
    enum: ['pdf', 'epub'],
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: [
      'started',
      'processing',
      'ready_for_review',
      'editing',
      'completed',
      'failed'
    ],
    default: 'started',
    index: true
  },

  // Timing
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processingStartedAt: Date,
  processingCompletedAt: Date,
  completedAt: Date,

  // Calculated duration in seconds
  processingDurationSeconds: Number,
  totalDurationSeconds: Number,

  // Output information
  outputFiles: [{
    fileName: String,
    fileType: String,
    fileSize: Number
  }],
  outputCount: {
    type: Number,
    default: 0
  },

  // Error tracking
  errorMessage: String,
  errorCode: String,
  retryCount: {
    type: Number,
    default: 0
  },

  // User information
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  uploadedByUsername: String,
  uploadedByEmail: String,

  // Processing metrics
  metrics: {
    imageCount: Number,
    tableCount: Number,
    pageCount: Number,
    chapterCount: Number,
    wordCount: Number
  },

  // Quality metrics
  quality: {
    validationErrors: Number,
    validationWarnings: Number,
    confidenceScore: Number
  },

  // Cost tracking
  cost: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheCreateTokens: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },  // USD
    model: { type: String, default: '' },
    breakdown: [{
      step: String,
      tokens: Number,
      cost: Number
    }]
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for common queries
conversionRecordSchema.index({ createdAt: -1 });
conversionRecordSchema.index({ status: 1, createdAt: -1 });
conversionRecordSchema.index({ fileType: 1, status: 1 });
conversionRecordSchema.index({ uploadedBy: 1, createdAt: -1 });

// Static method to create a record when conversion starts
conversionRecordSchema.statics.recordStart = async function(file, user) {
  return this.create({
    fileId: file._id,
    fileName: file.originalName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    externalJobId: file.externalJobId,
    externalService: file.externalService || file.fileType,
    status: 'started',
    startedAt: new Date(),
    uploadedBy: user._id || user,
    uploadedByUsername: user.username,
    uploadedByEmail: user.email
  });
};

// Static method to update record when processing starts
conversionRecordSchema.statics.recordProcessing = async function(fileId, jobId) {
  return this.findOneAndUpdate(
    { fileId },
    {
      status: 'processing',
      externalJobId: jobId,
      processingStartedAt: new Date()
    },
    { new: true, sort: { createdAt: -1 } }
  );
};

// Static method to update record when ready for review
conversionRecordSchema.statics.recordReadyForReview = async function(fileId, metadata = {}) {
  return this.findOneAndUpdate(
    { fileId },
    {
      status: 'ready_for_review',
      isbn: metadata.isbn,
      title: metadata.title,
      author: metadata.author,
      publisher: metadata.publisher,
      metrics: metadata.metrics,
      metadata: metadata
    },
    { new: true, sort: { createdAt: -1 } }
  );
};

// Static method to update record when completed
conversionRecordSchema.statics.recordComplete = async function(fileId, outputFiles = [], metadata = {}) {
  const now = new Date();
  const record = await this.findOne({ fileId }).sort({ createdAt: -1 });

  if (!record) return null;

  const processingDuration = record.processingStartedAt
    ? (now - record.processingStartedAt) / 1000
    : null;
  const totalDuration = record.startedAt
    ? (now - record.startedAt) / 1000
    : null;

  return this.findOneAndUpdate(
    { fileId },
    {
      status: 'completed',
      completedAt: now,
      processingCompletedAt: now,
      processingDurationSeconds: processingDuration,
      totalDurationSeconds: totalDuration,
      outputFiles: outputFiles.map(f => ({
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize
      })),
      outputCount: outputFiles.length,
      isbn: metadata.isbn || record.isbn,
      title: metadata.title || record.title,
      author: metadata.author || record.author,
      publisher: metadata.publisher || record.publisher,
      metrics: metadata.metrics || record.metrics,
      quality: metadata.quality,
      metadata: { ...record.metadata, ...metadata }
    },
    { new: true, sort: { createdAt: -1 } }
  );
};

// Static method to record failure
conversionRecordSchema.statics.recordFailure = async function(fileId, errorMessage, errorCode = null) {
  const now = new Date();
  const record = await this.findOne({ fileId }).sort({ createdAt: -1 });

  const processingDuration = record?.processingStartedAt
    ? (now - record.processingStartedAt) / 1000
    : null;

  return this.findOneAndUpdate(
    { fileId },
    {
      status: 'failed',
      completedAt: now,
      processingCompletedAt: now,
      processingDurationSeconds: processingDuration,
      errorMessage,
      errorCode,
      $inc: { retryCount: 1 }
    },
    { new: true, sort: { createdAt: -1 } }
  );
};

// Static method to get dashboard statistics
conversionRecordSchema.statics.getDashboardStats = async function(filters = {}) {
  const matchStage = {};

  if (filters.startDate) {
    matchStage.createdAt = { $gte: new Date(filters.startDate) };
  }
  if (filters.endDate) {
    matchStage.createdAt = {
      ...matchStage.createdAt,
      $lte: new Date(filters.endDate)
    };
  }
  if (filters.fileType) {
    matchStage.fileType = filters.fileType;
  }
  if (filters.uploadedBy) {
    matchStage.uploadedBy = mongoose.Types.ObjectId(filters.uploadedBy);
  }

  const [stats] = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        processing: {
          $sum: {
            $cond: [
              { $in: ['$status', ['started', 'processing', 'ready_for_review', 'editing']] },
              1,
              0
            ]
          }
        },
        pdfCount: {
          $sum: { $cond: [{ $eq: ['$fileType', 'pdf'] }, 1, 0] }
        },
        epubCount: {
          $sum: { $cond: [{ $eq: ['$fileType', 'epub'] }, 1, 0] }
        },
        avgProcessingTime: { $avg: '$processingDurationSeconds' },
        totalProcessingTime: { $sum: '$processingDurationSeconds' },
        totalFileSize: { $sum: '$fileSize' },
        avgFileSize: { $avg: '$fileSize' },
        totalCost: { $sum: '$cost.totalCost' },
        avgCost: { $avg: '$cost.totalCost' }
      }
    }
  ]);

  return stats || {
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    pdfCount: 0,
    epubCount: 0,
    avgProcessingTime: 0,
    totalProcessingTime: 0,
    totalFileSize: 0,
    avgFileSize: 0,
    totalCost: 0,
    avgCost: 0
  };
};

// Static method to get daily statistics for charts
conversionRecordSchema.statics.getDailyStats = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          status: '$status',
          fileType: '$fileType'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);
};

// Static method to get cost analytics with filters
conversionRecordSchema.statics.getCostAnalytics = async function(filters = {}) {
  const matchStage = {};

  if (filters.startDate) {
    matchStage.createdAt = { $gte: new Date(filters.startDate) };
  }
  if (filters.endDate) {
    matchStage.createdAt = {
      ...matchStage.createdAt,
      $lte: new Date(filters.endDate)
    };
  }
  if (filters.fileType) {
    matchStage.fileType = filters.fileType;
  }
  if (filters.publisher) {
    matchStage.publisher = { $regex: filters.publisher, $options: 'i' };
  }
  if (filters.model) {
    matchStage['cost.model'] = filters.model;
  }

  // Total cost
  const [totalStats] = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCost: { $sum: '$cost.totalCost' },
        totalInputTokens: { $sum: '$cost.inputTokens' },
        totalOutputTokens: { $sum: '$cost.outputTokens' },
        totalCacheReadTokens: { $sum: '$cost.cacheReadTokens' },
        totalCacheCreateTokens: { $sum: '$cost.cacheCreateTokens' },
        avgCostPerRecord: { $avg: '$cost.totalCost' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Cost by model
  const costByModel = await this.aggregate([
    { $match: { ...matchStage, 'cost.model': { $ne: '' } } },
    {
      $group: {
        _id: '$cost.model',
        totalCost: { $sum: '$cost.totalCost' },
        count: { $sum: 1 },
        avgCost: { $avg: '$cost.totalCost' }
      }
    },
    { $sort: { totalCost: -1 } }
  ]);

  // Cost by publisher
  const costByPublisher = await this.aggregate([
    { $match: { ...matchStage, publisher: { $ne: null } } },
    {
      $group: {
        _id: '$publisher',
        totalCost: { $sum: '$cost.totalCost' },
        count: { $sum: 1 },
        avgCost: { $avg: '$cost.totalCost' }
      }
    },
    { $sort: { totalCost: -1 } }
  ]);

  // Cost by fileType
  const costByFileType = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$fileType',
        totalCost: { $sum: '$cost.totalCost' },
        count: { $sum: 1 },
        avgCost: { $avg: '$cost.totalCost' }
      }
    },
    { $sort: { totalCost: -1 } }
  ]);

  // Daily cost breakdown
  const dailyCost = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalCost: { $sum: '$cost.totalCost' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Weekly cost breakdown
  const weeklyCost = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: '$createdAt' },
          week: { $isoWeek: '$createdAt' }
        },
        totalCost: { $sum: '$cost.totalCost' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.week': 1 } }
  ]);

  return {
    total: totalStats || {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreateTokens: 0,
      avgCostPerRecord: 0,
      count: 0
    },
    costByModel,
    costByPublisher,
    costByFileType,
    dailyCost,
    weeklyCost
  };
};

module.exports = mongoose.model('ConversionRecord', conversionRecordSchema, 'conversion_dashboard');
