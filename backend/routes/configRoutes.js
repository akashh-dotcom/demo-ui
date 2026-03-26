/**
 * Configuration Proxy Routes
 *
 * These routes proxy configuration requests to the external PDF and EPUB APIs.
 * This allows the frontend to fetch configuration options without needing
 * direct access to the external services.
 *
 * Also provides endpoints for persistent admin configuration management.
 */

const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');

const pdfApiService = require('../services/pdfApiService');
const epubApiService = require('../services/epubApiService');
const Configuration = require('../models/Configuration');

// Feature flag check
const USE_EXTERNAL_APIS = process.env.USE_EXTERNAL_APIS === 'true';

// All routes require authentication
router.use(authenticate);

// ============================================
// Health Check Endpoints
// ============================================

/**
 * @route   GET /api/config/health
 * @desc    Check health of external services
 * @access  Private
 */
router.get('/health', async (req, res) => {
  try {
    const [pdfHealth, epubHealth] = await Promise.all([
      pdfApiService.checkHealth(),
      epubApiService.checkHealth()
    ]);

    res.json({
      success: true,
      useExternalApis: USE_EXTERNAL_APIS,
      services: {
        pdf: pdfHealth,
        epub: epubHealth
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking service health',
      error: error.message
    });
  }
});

// ============================================
// PDF Configuration Endpoints
// ============================================

/**
 * @route   GET /api/config/pdf/options
 * @desc    Get PDF conversion configuration options
 * @access  Private
 */
router.get('/pdf/options', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const options = await pdfApiService.getConfigOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching PDF config options',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/config/pdf/info
 * @desc    Get PDF service info and capabilities
 * @access  Private
 */
router.get('/pdf/info', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const info = await pdfApiService.getServiceInfo();
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching PDF service info',
      error: error.message
    });
  }
});

// ============================================
// EPUB Configuration Endpoints
// ============================================

/**
 * @route   GET /api/config/epub/schema
 * @desc    Get EPUB configuration schema for form building
 * @access  Private
 */
router.get('/epub/schema', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const schema = await epubApiService.getConfigSchema();
    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching EPUB config schema',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/config/epub/dropdown-options
 * @desc    Get EPUB dropdown options for forms
 * @access  Private
 */
router.get('/epub/dropdown-options', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const options = await epubApiService.getDropdownOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching EPUB dropdown options',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/config/epub/info
 * @desc    Get EPUB service info and capabilities
 * @access  Private
 */
router.get('/epub/info', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const info = await epubApiService.getServiceInfo();
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching EPUB service info',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/config/epub/config
 * @desc    Get current EPUB configuration
 * @access  Private
 */
router.get('/epub/config', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const config = await epubApiService.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching EPUB config',
      error: error.message
    });
  }
});

// ============================================
// Publisher Management (EPUB)
// ============================================

/**
 * @route   GET /api/config/epub/publishers
 * @desc    List all publishers
 * @access  Private
 */
router.get('/epub/publishers', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const publishers = await epubApiService.listPublishers();
    res.json({
      success: true,
      data: publishers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching publishers',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/config/epub/publishers
 * @desc    Create a new publisher
 * @access  Private
 */
router.post('/epub/publishers', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const publisher = await epubApiService.createPublisher(req.body);
    res.json({
      success: true,
      data: publisher
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating publisher',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/config/epub/publishers/:name
 * @desc    Update a publisher
 * @access  Private
 */
router.put('/epub/publishers/:name', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const publisher = await epubApiService.updatePublisher(req.params.name, req.body);
    res.json({
      success: true,
      data: publisher
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating publisher',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/config/epub/publishers/:name
 * @desc    Delete a publisher
 * @access  Private
 */
router.delete('/epub/publishers/:name', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    await epubApiService.deletePublisher(req.params.name);
    res.json({
      success: true,
      message: 'Publisher deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting publisher',
      error: error.message
    });
  }
});

// ============================================
// Dashboard Data (aggregated from both services)
// ============================================

/**
 * @route   GET /api/config/dashboard
 * @desc    Get aggregated dashboard data from both services
 * @access  Private
 */
router.get('/dashboard', async (req, res) => {
  try {
    if (!USE_EXTERNAL_APIS) {
      return res.status(400).json({
        success: false,
        message: 'External APIs are not enabled'
      });
    }

    const [pdfDashboard, epubDashboard] = await Promise.allSettled([
      pdfApiService.getDashboardStats(),
      epubApiService.getDashboardData()
    ]);

    res.json({
      success: true,
      data: {
        pdf: pdfDashboard.status === 'fulfilled' ? pdfDashboard.value : null,
        epub: epubDashboard.status === 'fulfilled' ? epubDashboard.value : null,
        errors: {
          pdf: pdfDashboard.status === 'rejected' ? pdfDashboard.reason.message : null,
          epub: epubDashboard.status === 'rejected' ? epubDashboard.reason.message : null
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
});

// ============================================
// Persistent Admin Configuration
// ============================================

/**
 * @route   GET /api/config/admin
 * @desc    Get persistent admin configuration
 * @access  Private (Admin only)
 */
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const config = await Configuration.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching configuration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/config/admin
 * @desc    Update persistent admin configuration
 * @access  Private (Admin only)
 */
router.put('/admin', isAdmin, async (req, res) => {
  try {
    const { pdf, epub, useExternalApis } = req.body;

    const config = await Configuration.updateConfig(
      { pdf, epub, useExternalApis },
      req.user._id
    );

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating configuration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/config/admin/pdf
 * @desc    Update PDF pipeline configuration
 * @access  Private (Admin only)
 */
router.put('/admin/pdf', isAdmin, async (req, res) => {
  try {
    const config = await Configuration.updatePdfConfig(req.body, req.user._id);

    res.json({
      success: true,
      message: 'PDF configuration updated successfully',
      data: config.pdf
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating PDF configuration',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/config/admin/epub
 * @desc    Update EPUB pipeline configuration
 * @access  Private (Admin only)
 */
router.put('/admin/epub', isAdmin, async (req, res) => {
  try {
    const config = await Configuration.updateEpubConfig(req.body, req.user._id);

    res.json({
      success: true,
      message: 'EPUB configuration updated successfully',
      data: config.epub
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating EPUB configuration',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/config/admin/reset
 * @desc    Reset configuration to defaults
 * @access  Private (Admin only)
 */
router.post('/admin/reset', isAdmin, async (req, res) => {
  try {
    const config = await Configuration.resetToDefaults(req.user._id);

    res.json({
      success: true,
      message: 'Configuration reset to defaults',
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resetting configuration',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/config/admin/options
 * @desc    Get available options for configuration dropdowns
 * @access  Private (Admin only)
 */
router.get('/admin/options', isAdmin, async (req, res) => {
  try {
    // Define all available options for configuration forms
    const options = {
      pdf: {
        models: [
          { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Latest)' },
          { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
          { value: 'gpt-4', label: 'GPT-4' },
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'claude-3-opus', label: 'Claude 3 Opus' },
          { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' }
        ],
        dpiOptions: [
          { value: 150, label: '150 DPI (Fast)' },
          { value: 200, label: '200 DPI (Standard)' },
          { value: 300, label: '300 DPI (High Quality)' },
          { value: 600, label: '600 DPI (Maximum)' }
        ],
        processingModes: [
          { value: 'standard', label: 'Standard' },
          { value: 'ocr', label: 'OCR (For scanned documents)' },
          { value: 'hybrid', label: 'Hybrid (Auto-detect)' }
        ],
        templateTypes: [
          { value: 'docbook', label: 'DocBook' },
          { value: 'xml', label: 'XML' },
          { value: 'html', label: 'HTML' }
        ],
        languages: [
          { value: 'en', label: 'English' },
          { value: 'de', label: 'German' },
          { value: 'fr', label: 'French' },
          { value: 'es', label: 'Spanish' },
          { value: 'it', label: 'Italian' },
          { value: 'pt', label: 'Portuguese' }
        ]
      },
      epub: {
        outputFormats: [
          { value: 'xml', label: 'XML' },
          { value: 'docbook', label: 'DocBook' },
          { value: 'html5', label: 'HTML5' }
        ],
        chapterSplitOptions: [
          { value: 'auto', label: 'Automatic' },
          { value: 'manual', label: 'Manual' },
          { value: 'heading-based', label: 'Heading-based' }
        ],
        validationRules: [
          { value: 'strict', label: 'Strict' },
          { value: 'relaxed', label: 'Relaxed' },
          { value: 'none', label: 'None' }
        ],
        languages: [
          { value: 'en', label: 'English' },
          { value: 'de', label: 'German' },
          { value: 'fr', label: 'French' },
          { value: 'es', label: 'Spanish' },
          { value: 'it', label: 'Italian' },
          { value: 'pt', label: 'Portuguese' }
        ]
      }
    };

    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching configuration options',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/config/admin/email-templates
 * @desc    Update email templates in configuration
 * @access  Private (Admin only)
 */
router.put('/admin/email-templates', isAdmin, async (req, res) => {
  try {
    const { success: successTemplate, failure: failureTemplate, batchComplete } = req.body;

    const config = await Configuration.getConfig();

    if (typeof successTemplate === 'string') {
      config.emailTemplates.success = successTemplate;
    }
    if (typeof failureTemplate === 'string') {
      config.emailTemplates.failure = failureTemplate;
    }
    if (typeof batchComplete === 'string') {
      config.emailTemplates.batchComplete = batchComplete;
    }

    config.lastUpdatedBy = req.user._id;
    await config.save();

    res.json({
      success: true,
      message: 'Email templates updated successfully',
      data: config.emailTemplates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating email templates',
      error: error.message
    });
  }
});

module.exports = router;
