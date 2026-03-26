const mongoose = require('mongoose');

/**
 * Configuration Schema
 *
 * Stores persistent admin configurations for PDF and EPUB pipelines.
 * Uses a singleton pattern - only one configuration document exists.
 */

const pdfConfigSchema = new mongoose.Schema({
  // AI Model Configuration
  model: {
    type: String,
    enum: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4', 'gpt-4-turbo', 'claude-3-opus', 'claude-3-sonnet'],
    default: 'claude-sonnet-4-20250514'
  },
  temperature: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.1
  },

  // Processing Configuration
  dpi: {
    type: Number,
    enum: [150, 200, 300, 600],
    default: 300
  },
  batchSize: {
    type: Number,
    min: 1,
    max: 20,
    default: 5
  },
  processingMode: {
    type: String,
    enum: ['standard', 'ocr', 'hybrid'],
    default: 'standard'
  },
  language: {
    type: String,
    enum: ['en', 'de', 'fr', 'es', 'it', 'pt'],
    default: 'en'
  },

  // Output Configuration
  templateType: {
    type: String,
    enum: ['docbook', 'xml', 'html'],
    default: 'docbook'
  },
  tocDepth: {
    type: Number,
    min: 1,
    max: 6,
    default: 3
  },
  createDocx: {
    type: Boolean,
    default: true
  },
  createRittdoc: {
    type: Boolean,
    default: true
  },
  includeToc: {
    type: Boolean,
    default: true
  },
  skipExtraction: {
    type: Boolean,
    default: false
  },

  // Retry Configuration
  maxRetries: {
    type: Number,
    min: 0,
    max: 10,
    default: 3
  },
  retryDelay: {
    type: Number,
    min: 1000,
    max: 30000,
    default: 5000
  }
}, { _id: false });

const epubConfigSchema = new mongoose.Schema({
  // Output Configuration
  outputFormat: {
    type: String,
    enum: ['xml', 'docbook', 'html5'],
    default: 'xml'
  },
  chapterSplitOption: {
    type: String,
    enum: ['auto', 'manual', 'heading-based'],
    default: 'auto'
  },
  validationRule: {
    type: String,
    enum: ['strict', 'relaxed', 'none'],
    default: 'relaxed'
  },

  // Default Publisher
  defaultPublisher: {
    type: String,
    default: ''
  },

  // Metadata Defaults
  defaultLanguage: {
    type: String,
    enum: ['en', 'de', 'fr', 'es', 'it', 'pt'],
    default: 'en'
  },
  preserveMetadata: {
    type: Boolean,
    default: true
  },

  // Processing Options
  enableValidation: {
    type: Boolean,
    default: true
  },
  generateReport: {
    type: Boolean,
    default: true
  },

  // Retry Configuration
  maxRetries: {
    type: Number,
    min: 0,
    max: 10,
    default: 3
  },
  retryDelay: {
    type: Number,
    min: 1000,
    max: 30000,
    default: 5000
  }
}, { _id: false });

const configurationSchema = new mongoose.Schema({
  // Singleton identifier
  _singleton: {
    type: String,
    default: 'config',
    unique: true
  },

  // Pipeline Configurations
  pdf: {
    type: pdfConfigSchema,
    default: () => ({})
  },
  epub: {
    type: epubConfigSchema,
    default: () => ({})
  },

  // Global Settings
  useExternalApis: {
    type: Boolean,
    default: true
  },

  // Audit Info
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

/**
 * Get the singleton configuration
 * Creates default if doesn't exist
 */
configurationSchema.statics.getConfig = async function() {
  let config = await this.findOne({ _singleton: 'config' });

  if (!config) {
    config = await this.create({ _singleton: 'config' });
  }

  return config;
};

/**
 * Update PDF configuration
 */
configurationSchema.statics.updatePdfConfig = async function(pdfConfig, userId) {
  const config = await this.getConfig();

  // Merge with existing config
  Object.assign(config.pdf, pdfConfig);
  config.lastUpdatedBy = userId;

  await config.save();
  return config;
};

/**
 * Update EPUB configuration
 */
configurationSchema.statics.updateEpubConfig = async function(epubConfig, userId) {
  const config = await this.getConfig();

  // Merge with existing config
  Object.assign(config.epub, epubConfig);
  config.lastUpdatedBy = userId;

  await config.save();
  return config;
};

/**
 * Update all configuration
 */
configurationSchema.statics.updateConfig = async function(updates, userId) {
  const config = await this.getConfig();

  if (updates.pdf) {
    Object.assign(config.pdf, updates.pdf);
  }
  if (updates.epub) {
    Object.assign(config.epub, updates.epub);
  }
  if (typeof updates.useExternalApis === 'boolean') {
    config.useExternalApis = updates.useExternalApis;
  }

  config.lastUpdatedBy = userId;
  await config.save();
  return config;
};

/**
 * Reset to defaults
 */
configurationSchema.statics.resetToDefaults = async function(userId) {
  await this.deleteOne({ _singleton: 'config' });
  const config = await this.create({
    _singleton: 'config',
    lastUpdatedBy: userId
  });
  return config;
};

module.exports = mongoose.model('Configuration', configurationSchema);
