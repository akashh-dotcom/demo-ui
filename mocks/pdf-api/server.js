/**
 * Mock PDF Processing API
 * Simulates the external PDF-to-XML conversion service for development/testing
 *
 * Endpoints:
 * - POST /convert - Start a conversion job
 * - GET /jobs/:jobId - Get job status
 * - POST /jobs/:jobId/editor - Launch editor
 * - POST /jobs/:jobId/editor/stop - Stop editor
 * - POST /jobs/:jobId/finalize - Finalize conversion
 * - GET /jobs/:jobId/files - List output files
 * - GET /jobs/:jobId/files/:filename - Download file
 * - GET /dashboard - Get dashboard stats
 * - GET /config/options - Get configuration options
 * - GET /health - Health check
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// File upload handling
const storage = multer.memoryStorage();
const upload = multer({ storage });

// In-memory job storage
const jobs = new Map();

// Simulate processing delays
const PROCESSING_TIME = 5000; // 5 seconds
const EDITOR_LAUNCH_TIME = 2000;

// Helper to create a job
function createJob(filename, originalName) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    filename: originalName,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editorUrl: null,
    editorActive: false,
    outputFiles: [],
    error: null
  };
  jobs.set(jobId, job);
  return job;
}

// Simulate processing
function simulateProcessing(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  // Simulate progress updates
  let progress = 0;
  const interval = setInterval(() => {
    progress += 20;
    job.progress = Math.min(progress, 100);
    job.updatedAt = new Date().toISOString();

    if (progress >= 100) {
      clearInterval(interval);
      job.status = 'ready_for_review';
      job.outputFiles = [
        { name: 'output.xml', size: 45678, type: 'application/xml' },
        { name: 'output.docbook', size: 52341, type: 'application/xml' },
        { name: 'metadata.json', size: 1234, type: 'application/json' }
      ];
    }
  }, PROCESSING_TIME / 5);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'pdf-api-mock', version: '1.0.0' });
});

// Get configuration options
app.get('/config/options', (req, res) => {
  res.json({
    outputFormats: ['xml', 'docbook', 'html'],
    processingModes: ['standard', 'ocr', 'hybrid'],
    languages: ['en', 'de', 'fr', 'es'],
    aiAssistance: {
      enabled: true,
      models: ['gpt-4', 'claude-3']
    }
  });
});

// Start conversion
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const job = createJob(req.file.filename, req.file.originalname);

  // Start async processing
  setTimeout(() => simulateProcessing(job.id), 500);

  res.status(202).json({
    jobId: job.id,
    status: job.status,
    message: 'Conversion job started',
    statusUrl: `/jobs/${job.id}`
  });
});

// Get job status
app.get('/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    filename: job.filename,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    editorUrl: job.editorUrl,
    editorActive: job.editorActive,
    outputFiles: job.outputFiles,
    error: job.error
  });
});

// Launch editor
app.post('/jobs/:jobId/editor', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'ready_for_review' && job.status !== 'editing') {
    return res.status(400).json({ error: 'Job not ready for editing' });
  }

  // Simulate editor launch
  setTimeout(() => {
    job.status = 'editing';
    job.editorActive = true;
    job.editorUrl = `http://localhost:8080/editor/${job.id}`;
    job.updatedAt = new Date().toISOString();
  }, EDITOR_LAUNCH_TIME);

  res.json({
    message: 'Editor launching',
    editorUrl: `http://localhost:8080/editor/${job.id}`,
    status: 'launching'
  });
});

// Stop editor
app.post('/jobs/:jobId/editor/stop', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.editorActive = false;
  job.editorUrl = null;
  job.status = 'ready_for_review';
  job.updatedAt = new Date().toISOString();

  res.json({ message: 'Editor stopped', status: job.status });
});

// Finalize conversion
app.post('/jobs/:jobId/finalize', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.status = 'finalizing';
  job.updatedAt = new Date().toISOString();

  // Simulate finalization
  setTimeout(() => {
    job.status = 'completed';
    job.updatedAt = new Date().toISOString();
    job.outputFiles.push({
      name: 'final_output.xml',
      size: 48901,
      type: 'application/xml',
      final: true
    });
  }, 2000);

  res.json({ message: 'Finalization started', status: 'finalizing' });
});

// List output files
app.get('/jobs/:jobId/files', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ files: job.outputFiles });
});

// Download file (mock)
app.get('/jobs/:jobId/files/:filename', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const file = job.outputFiles.find(f => f.name === req.params.filename);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Return mock XML content
  const mockContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <title>Mock PDF Conversion Output</title>
  <jobId>${job.id}</jobId>
  <filename>${job.filename}</filename>
  <generatedAt>${new Date().toISOString()}</generatedAt>
  <content>
    <section>
      <heading>Sample Section</heading>
      <paragraph>This is mock converted content from the PDF processing API.</paragraph>
    </section>
  </content>
</document>`;

  res.set('Content-Type', file.type);
  res.set('Content-Disposition', `attachment; filename="${file.name}"`);
  res.send(mockContent);
});

// Dashboard stats
app.get('/dashboard', (req, res) => {
  const allJobs = Array.from(jobs.values());

  res.json({
    totalJobs: allJobs.length,
    completed: allJobs.filter(j => j.status === 'completed').length,
    processing: allJobs.filter(j => j.status === 'processing').length,
    failed: allJobs.filter(j => j.status === 'failed').length,
    queued: allJobs.filter(j => j.status === 'queued').length,
    recentJobs: allJobs.slice(-10).reverse()
  });
});

// List all jobs
app.get('/jobs', (req, res) => {
  const allJobs = Array.from(jobs.values());
  res.json({ jobs: allJobs });
});

app.listen(PORT, () => {
  console.log(`Mock PDF API running on port ${PORT}`);
});
