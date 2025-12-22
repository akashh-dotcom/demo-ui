/**
 * EPUB Converter API Service
 *
 * Handles communication with the external RittDoc EPUB conversion service.
 * The EPUB API runs on port 5001 and provides endpoints for conversion,
 * job management, configuration, and dashboard data.
 *
 * The EPUB Editor runs separately on port 5000 (configurable).
 *
 * @see ePub_INTEGRATION_GUIDE.md for full API documentation
 */

const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const EPUB_API_URL = process.env.EPUB_API_URL || 'http://localhost:5001';
const EPUB_EDITOR_URL = process.env.EPUB_EDITOR_URL || 'http://localhost:5000';
const EPUB_API_TIMEOUT = parseInt(process.env.EPUB_API_TIMEOUT) || 30000;
const EPUB_POLL_INTERVAL = parseInt(process.env.EPUB_POLL_INTERVAL) || 2000;

/**
 * Job status values from EPUB API
 */
const JobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Terminal statuses that indicate job is done (success or failure)
 */
const TERMINAL_STATUSES = [JobStatus.COMPLETED, JobStatus.FAILED];

/**
 * Make HTTP request to EPUB API
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${EPUB_API_URL}/api/v1${endpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || EPUB_API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EPUB API error (${response.status}): ${errorText}`);
    }

    // Handle streaming responses (file downloads)
    if (options.responseType === 'stream') {
      return response;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`EPUB API request timeout after ${EPUB_API_TIMEOUT}ms`);
    }
    throw error;
  }
}

/**
 * Check if EPUB API service is healthy
 */
async function checkHealth() {
  try {
    const result = await apiRequest('/health');
    return {
      healthy: true,
      details: result
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Get service info including capabilities and limits
 */
async function getServiceInfo() {
  return await apiRequest('/service-info');
}

/**
 * Get configuration schema for dynamic form building
 */
async function getConfigSchema() {
  return await apiRequest('/config/schema');
}

/**
 * Get dropdown options for configuration forms
 */
async function getDropdownOptions() {
  return await apiRequest('/config/dropdown-options');
}

/**
 * Get current configuration
 */
async function getConfig() {
  return await apiRequest('/config');
}

/**
 * Update configuration
 */
async function updateConfig(config) {
  return await apiRequest('/config', {
    method: 'PUT',
    body: JSON.stringify({ config })
  });
}

/**
 * Start an EPUB conversion job
 *
 * @param {string} filePath - Path to the EPUB file
 * @param {Object} config - Conversion configuration options
 * @returns {Object} Job object with job_id
 */
async function startConversion(filePath, config = {}) {
  const formData = new FormData();

  // Add the file
  formData.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'application/epub+zip'
  });

  // Add configuration options if any
  Object.entries(config).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  try {
    const response = await axios.post(`${EPUB_API_URL}/api/v1/convert`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: EPUB_API_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`EPUB conversion failed: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`EPUB conversion failed: ${error.message}`);
  }
}

/**
 * Start a batch conversion
 *
 * @param {string[]} filePaths - Array of file paths
 * @param {Object} config - Conversion configuration
 * @returns {Object} Batch job info
 */
async function startBatchConversion(filePaths, config = {}) {
  const formData = new FormData();

  // Add all files
  filePaths.forEach((filePath) => {
    formData.append('files', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: 'application/epub+zip'
    });
  });

  // Add configuration
  Object.entries(config).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  try {
    const response = await axios.post(`${EPUB_API_URL}/api/v1/convert/batch`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: EPUB_API_TIMEOUT * 5, // Longer timeout for batch
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`EPUB batch conversion failed: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`EPUB batch conversion failed: ${error.message}`);
  }
}

/**
 * Get job status
 *
 * @param {string} jobId - The job ID
 * @returns {Object} Job status object
 */
async function getJobStatus(jobId) {
  return await apiRequest(`/jobs/${jobId}`);
}

/**
 * List all jobs
 */
async function listJobs() {
  return await apiRequest('/jobs');
}

/**
 * Cancel a job
 *
 * @param {string} jobId - The job ID
 */
async function cancelJob(jobId) {
  await apiRequest(`/jobs/${jobId}`, {
    method: 'DELETE'
  });
}

/**
 * Poll job until it reaches a target status
 *
 * @param {string} jobId - The job ID
 * @param {string[]} targetStatuses - Array of statuses to wait for
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Object} Final job status
 */
async function pollJobUntil(jobId, targetStatuses = TERMINAL_STATUSES, onProgress = null) {
  while (true) {
    const job = await getJobStatus(jobId);

    if (onProgress) {
      onProgress(job);
    }

    if (targetStatuses.includes(job.status) || job.status === JobStatus.FAILED) {
      return job;
    }

    await new Promise(resolve => setTimeout(resolve, EPUB_POLL_INTERVAL));
  }
}

/**
 * Get download URL for job result
 *
 * @param {string} jobId - The job ID
 * @returns {string} Full download URL
 */
function getDownloadUrl(jobId) {
  return `${EPUB_API_URL}/api/v1/download/${jobId}`;
}

/**
 * Get validation report download URL
 *
 * @param {string} jobId - The job ID
 * @returns {string} Full download URL for report
 */
function getReportDownloadUrl(jobId) {
  return `${EPUB_API_URL}/api/v1/download/${jobId}/report`;
}

/**
 * Download job result to local path
 *
 * @param {string} jobId - The job ID
 * @param {string} destPath - Local destination path
 */
async function downloadResult(jobId, destPath) {
  const response = await fetch(getDownloadUrl(jobId));

  if (!response.ok) {
    throw new Error(`Failed to download result: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));

  return {
    path: destPath,
    size: buffer.byteLength
  };
}

// ============================================
// Editor Functions (runs on separate port)
// ============================================

/**
 * Load a package into the editor
 *
 * @param {string} packagePath - Path to the ZIP package
 * @returns {Object} Editor session info
 */
async function loadPackageInEditor(packagePath) {
  const response = await fetch(`${EPUB_EDITOR_URL}/api/load-package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zipPath: packagePath })
  });

  if (!response.ok) {
    throw new Error(`Failed to load package in editor: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get list of chapters in current package
 */
async function getEditorChapters() {
  const response = await fetch(`${EPUB_EDITOR_URL}/api/chapters`);
  return await response.json();
}

/**
 * Get chapter content
 *
 * @param {string} filename - Chapter filename (e.g., 'ch001.xml')
 */
async function getChapterContent(filename) {
  const response = await fetch(`${EPUB_EDITOR_URL}/api/chapter/${filename}`);
  return await response.json();
}

/**
 * Save chapter changes
 *
 * @param {string} filename - Chapter filename
 * @param {string} content - Updated XML content
 */
async function saveChapter(filename, content) {
  const response = await fetch(`${EPUB_EDITOR_URL}/api/save-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content })
  });

  if (!response.ok) {
    throw new Error(`Failed to save chapter: ${response.status}`);
  }

  return await response.json();
}

/**
 * Save all changes and reprocess package
 */
async function savePackage() {
  const response = await fetch(`${EPUB_EDITOR_URL}/api/save-package`, {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error(`Failed to save package: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get the editor URL for embedding or opening
 */
function getEditorUrl() {
  return EPUB_EDITOR_URL;
}

// ============================================
// Dashboard Functions (MongoDB)
// ============================================

/**
 * Get MongoDB connection status
 */
async function getMongoStatus() {
  return await apiRequest('/mongodb/status');
}

/**
 * Get full dashboard data
 */
async function getDashboardData() {
  return await apiRequest('/mongodb/dashboard');
}

/**
 * Get aggregated statistics
 */
async function getStatistics() {
  return await apiRequest('/mongodb/statistics');
}

/**
 * Query conversions with filters
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.status - Status filter
 * @param {string} filters.type - Type filter
 * @param {string} filters.start_date - Start date (ISO string)
 * @param {string} filters.end_date - End date (ISO string)
 * @param {number} filters.limit - Result limit
 * @param {number} filters.skip - Skip for pagination
 */
async function queryConversions(filters = {}) {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.start_date) params.set('start_date', filters.start_date);
  if (filters.end_date) params.set('end_date', filters.end_date);
  if (filters.limit) params.set('limit', filters.limit.toString());
  if (filters.skip) params.set('skip', filters.skip.toString());

  const queryString = params.toString();
  const endpoint = queryString ? `/mongodb/conversions?${queryString}` : '/mongodb/conversions';

  return await apiRequest(endpoint);
}

/**
 * Get recent conversions
 *
 * @param {number} limit - Number of results
 */
async function getRecentConversions(limit = 10) {
  return await apiRequest(`/mongodb/recent?limit=${limit}`);
}

/**
 * Get failed conversions
 *
 * @param {number} limit - Number of results
 */
async function getFailedConversions(limit = 50) {
  return await apiRequest(`/mongodb/failed?limit=${limit}`);
}

// ============================================
// Publisher Management
// ============================================

/**
 * List all publishers
 */
async function listPublishers() {
  return await apiRequest('/config/publishers');
}

/**
 * Create a new publisher
 *
 * @param {Object} publisher - Publisher data
 */
async function createPublisher(publisher) {
  return await apiRequest('/config/publishers', {
    method: 'POST',
    body: JSON.stringify(publisher)
  });
}

/**
 * Update a publisher
 *
 * @param {string} name - Publisher name
 * @param {Object} publisher - Updated publisher data
 */
async function updatePublisher(name, publisher) {
  return await apiRequest(`/config/publishers/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(publisher)
  });
}

/**
 * Delete a publisher
 *
 * @param {string} name - Publisher name
 */
async function deletePublisher(name) {
  await apiRequest(`/config/publishers/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
}

/**
 * Map EPUB API status to internal File model status
 *
 * @param {string} epubStatus - Status from EPUB API
 * @returns {string} Mapped status for File model
 */
function mapStatusToFileStatus(epubStatus) {
  const statusMap = {
    'pending': 'pending',
    'running': 'processing',
    'completed': 'completed',
    'failed': 'failed'
  };

  return statusMap[epubStatus] || 'processing';
}

module.exports = {
  // Constants
  EPUB_API_URL,
  EPUB_EDITOR_URL,
  JobStatus,
  TERMINAL_STATUSES,

  // Health & Info
  checkHealth,
  getServiceInfo,

  // Configuration
  getConfigSchema,
  getDropdownOptions,
  getConfig,
  updateConfig,

  // Conversion
  startConversion,
  startBatchConversion,
  getJobStatus,
  listJobs,
  cancelJob,
  pollJobUntil,

  // Downloads
  getDownloadUrl,
  getReportDownloadUrl,
  downloadResult,

  // Editor (separate service)
  loadPackageInEditor,
  getEditorChapters,
  getChapterContent,
  saveChapter,
  savePackage,
  getEditorUrl,

  // Dashboard
  getMongoStatus,
  getDashboardData,
  getStatistics,
  queryConversions,
  getRecentConversions,
  getFailedConversions,

  // Publishers
  listPublishers,
  createPublisher,
  updatePublisher,
  deletePublisher,

  // Utils
  mapStatusToFileStatus
};
