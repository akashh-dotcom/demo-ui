/**
 * PDF Pipeline API Service
 *
 * Handles communication with the external PDF-to-XML conversion service.
 * The PDF API runs on port 8000 and provides endpoints for conversion,
 * job management, and web editor functionality.
 *
 * @see PDF_INTEGRATION.md for full API documentation
 */

const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const PDF_API_URL = process.env.PDF_API_URL || 'http://localhost:8000';
const PDF_API_TIMEOUT = parseInt(process.env.PDF_API_TIMEOUT) || 30000;
const PDF_POLL_INTERVAL = parseInt(process.env.PDF_POLL_INTERVAL) || 2000;

/**
 * Job status values from PDF API
 */
const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  EXTRACTING: 'extracting',
  CONVERTING: 'converting',
  READY_FOR_REVIEW: 'ready_for_review',
  EDITING: 'editing',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Terminal statuses that indicate job is done (success or failure)
 */
const TERMINAL_STATUSES = [JobStatus.COMPLETED, JobStatus.FAILED];

/**
 * Statuses that indicate job is ready for user action
 */
const ACTIONABLE_STATUSES = [JobStatus.READY_FOR_REVIEW, JobStatus.COMPLETED, JobStatus.FAILED];

/**
 * Make HTTP request to PDF API
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${PDF_API_URL}/api/v1${endpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || PDF_API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PDF API error (${response.status}): ${errorText}`);
    }

    // Handle streaming responses (file downloads)
    if (options.responseType === 'stream') {
      return response;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`PDF API request timeout after ${PDF_API_TIMEOUT}ms`);
    }
    throw error;
  }
}

/**
 * Check if PDF API service is healthy
 */
async function checkHealth() {
  try {
    const result = await apiRequest('/health');
    return {
      healthy: result.status === 'healthy',
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
  return await apiRequest('/info');
}

/**
 * Get configuration options for conversion forms
 */
async function getConfigOptions() {
  return await apiRequest('/config/options');
}

/**
 * Start a PDF conversion job
 *
 * @param {string} filePath - Path to the PDF file
 * @param {Object} config - Conversion configuration options
 * @returns {Object} Job object with job_id
 */
async function startConversion(filePath, config = {}) {
  const formData = new FormData();

  // Add the file
  formData.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'application/pdf'
  });

  // Add configuration options
  const defaultConfig = {
    model: 'claude-sonnet-4-20250514',
    dpi: 300,
    temperature: 0.1,
    batch_size: 5,
    toc_depth: 3,
    template_type: 'docbook',
    create_docx: true,
    create_rittdoc: true,
    include_toc: true,
    skip_extraction: false
  };

  const mergedConfig = { ...defaultConfig, ...config };

  Object.entries(mergedConfig).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  try {
    const response = await axios.post(`${PDF_API_URL}/api/v1/convert`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: PDF_API_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`PDF conversion failed: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`PDF conversion failed: ${error.message}`);
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
 * Poll job until it reaches a target status
 *
 * @param {string} jobId - The job ID
 * @param {string[]} targetStatuses - Array of statuses to wait for
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Object} Final job status
 */
async function pollJobUntil(jobId, targetStatuses = ACTIONABLE_STATUSES, onProgress = null) {
  while (true) {
    const job = await getJobStatus(jobId);

    if (onProgress) {
      onProgress(job);
    }

    if (targetStatuses.includes(job.status) || job.status === JobStatus.FAILED) {
      return job;
    }

    await new Promise(resolve => setTimeout(resolve, PDF_POLL_INTERVAL));
  }
}

/**
 * Launch the web editor for a job
 *
 * @param {string} jobId - The job ID
 * @returns {Object} Object containing editor_url
 */
async function launchEditor(jobId) {
  return await apiRequest(`/jobs/${jobId}/editor`, {
    method: 'POST'
  });
}

/**
 * Stop the web editor for a job
 *
 * @param {string} jobId - The job ID
 */
async function stopEditor(jobId) {
  await apiRequest(`/jobs/${jobId}/editor`, {
    method: 'DELETE'
  });
}

/**
 * Finalize a job without using the editor
 *
 * @param {string} jobId - The job ID
 * @returns {Object} Updated job status
 */
async function finalizeJob(jobId) {
  return await apiRequest(`/jobs/${jobId}/finalize`, {
    method: 'POST'
  });
}

/**
 * List output files for a completed job
 *
 * @param {string} jobId - The job ID
 * @returns {Object} Object containing files array
 */
async function listOutputFiles(jobId) {
  return await apiRequest(`/jobs/${jobId}/files`);
}

/**
 * Get download URL for a specific output file
 *
 * @param {string} jobId - The job ID
 * @param {string} filename - The filename to download
 * @returns {string} Full download URL
 */
function getDownloadUrl(jobId, filename) {
  return `${PDF_API_URL}/api/v1/jobs/${jobId}/files/${encodeURIComponent(filename)}`;
}

/**
 * Download an output file to local path
 *
 * @param {string} jobId - The job ID
 * @param {string} filename - The filename to download
 * @param {string} destPath - Local destination path
 */
async function downloadFile(jobId, filename, destPath) {
  const response = await fetch(getDownloadUrl(jobId, filename));

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));

  return {
    path: destPath,
    size: buffer.byteLength
  };
}

/**
 * Get dashboard statistics
 */
async function getDashboardStats() {
  try {
    return await apiRequest('/mongodb/dashboard');
  } catch (error) {
    // Fallback to in-memory dashboard if MongoDB not available
    return await apiRequest('/dashboard');
  }
}

/**
 * Map PDF API status to internal File model status
 *
 * @param {string} pdfStatus - Status from PDF API
 * @returns {string} Mapped status for File model
 */
function mapStatusToFileStatus(pdfStatus) {
  const statusMap = {
    'pending': 'pending',
    'processing': 'processing',
    'extracting': 'processing',
    'converting': 'processing',
    'ready_for_review': 'ready_for_review',
    'editing': 'editing',
    'finalizing': 'finalizing',
    'completed': 'completed',
    'failed': 'failed'
  };

  return statusMap[pdfStatus] || 'processing';
}

module.exports = {
  // Constants
  PDF_API_URL,
  JobStatus,
  TERMINAL_STATUSES,
  ACTIONABLE_STATUSES,

  // Health & Info
  checkHealth,
  getServiceInfo,
  getConfigOptions,

  // Conversion
  startConversion,
  getJobStatus,
  pollJobUntil,

  // Editor
  launchEditor,
  stopEditor,

  // Finalization
  finalizeJob,

  // Files
  listOutputFiles,
  getDownloadUrl,
  downloadFile,

  // Dashboard
  getDashboardStats,

  // Utils
  mapStatusToFileStatus
};
