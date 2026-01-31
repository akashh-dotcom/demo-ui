/**
 * Mock EPUB Processing API
 * Simulates the external EPUB-to-XML conversion service for development/testing
 *
 * Endpoints:
 * - POST /api/convert - Start a conversion job
 * - GET /api/jobs/:jobId - Get job status
 * - GET /api/jobs/:jobId/download - Download result
 * - POST /api/editor/load - Load package in editor
 * - GET /api/editor/chapters - Get chapter list
 * - POST /api/editor/save - Save package
 * - GET /api/publishers - List publishers
 * - POST /api/publishers - Create publisher
 * - GET /api/dashboard - Get dashboard stats
 * - GET /api/config/schema - Get config schema
 * - GET /health - Health check
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5001;
const EDITOR_PORT = process.env.EDITOR_PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// File upload handling
const storage = multer.memoryStorage();
const upload = multer({ storage });

// In-memory storage
const jobs = new Map();
const publishers = new Map([
  ['pub-1', { id: 'pub-1', name: 'Default Publisher', config: { outputFormat: 'xml' } }]
]);
const editorSessions = new Map();

// Simulate processing delays
const PROCESSING_TIME = 6000; // 6 seconds

// Helper to create a job
function createJob(filename, originalName, publisherId) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    filename: originalName,
    publisherId: publisherId || 'pub-1',
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chapters: [],
    outputUrl: null,
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

  let progress = 0;
  const interval = setInterval(() => {
    progress += 25;
    job.progress = Math.min(progress, 100);
    job.updatedAt = new Date().toISOString();

    if (progress >= 100) {
      clearInterval(interval);
      job.status = 'ready_for_review';
      job.chapters = [
        { id: 'ch-1', title: 'Introduction', order: 1 },
        { id: 'ch-2', title: 'Chapter 1: Getting Started', order: 2 },
        { id: 'ch-3', title: 'Chapter 2: Main Content', order: 3 },
        { id: 'ch-4', title: 'Conclusion', order: 4 }
      ];
      job.outputUrl = `/api/jobs/${jobId}/download`;
    }
  }, PROCESSING_TIME / 4);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'epub-api-mock', version: '1.0.0' });
});

// Config schema
app.get('/api/config/schema', (req, res) => {
  res.json({
    outputFormats: ['xml', 'docbook', 'html5'],
    chapterSplitOptions: ['auto', 'manual', 'heading-based'],
    metadataFields: ['title', 'author', 'publisher', 'isbn', 'language'],
    validationRules: ['strict', 'relaxed', 'none']
  });
});

// Start conversion
app.post('/api/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const publisherId = req.body.publisherId || 'pub-1';
  const job = createJob(req.file.filename, req.file.originalname, publisherId);

  // Start async processing
  setTimeout(() => simulateProcessing(job.id), 500);

  res.status(202).json({
    jobId: job.id,
    status: job.status,
    message: 'EPUB conversion job started',
    statusUrl: `/api/jobs/${job.id}`
  });
});

// Get job status
app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    filename: job.filename,
    publisherId: job.publisherId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    chapters: job.chapters,
    outputUrl: job.outputUrl,
    error: job.error
  });
});

// Download result
app.get('/api/jobs/:jobId/download', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'ready_for_review' && job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not ready for download' });
  }

  const mockContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata>
    <title>Mock EPUB Conversion Output</title>
    <creator>Demo Converter</creator>
    <identifier>${job.id}</identifier>
  </metadata>
  <manifest>
    ${job.chapters.map(ch => `<item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${job.chapters.map(ch => `<itemref idref="${ch.id}"/>`).join('\n    ')}
  </spine>
</package>`;

  res.set('Content-Type', 'application/xml');
  res.set('Content-Disposition', `attachment; filename="${job.filename.replace('.epub', '')}_output.xml"`);
  res.send(mockContent);
});

// ===============================
// Editor Endpoints
// ===============================

// Load package in editor
app.post('/api/editor/load', (req, res) => {
  const { jobId } = req.body;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const sessionId = uuidv4();
  editorSessions.set(sessionId, {
    id: sessionId,
    jobId: job.id,
    chapters: job.chapters,
    createdAt: new Date().toISOString()
  });

  job.status = 'editing';
  job.updatedAt = new Date().toISOString();

  res.json({
    sessionId,
    editorUrl: `http://localhost:${EDITOR_PORT}/editor/${sessionId}`,
    chapters: job.chapters
  });
});

// Get editor chapters
app.get('/api/editor/chapters', (req, res) => {
  const { sessionId } = req.query;
  const session = editorSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ chapters: session.chapters });
});

// Save package
app.post('/api/editor/save', (req, res) => {
  const { sessionId, chapters } = req.body;
  const session = editorSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const job = jobs.get(session.jobId);
  if (job) {
    job.chapters = chapters || job.chapters;
    job.status = 'completed';
    job.updatedAt = new Date().toISOString();
  }

  res.json({ message: 'Package saved successfully', status: 'completed' });
});

// ===============================
// Publisher Management
// ===============================

// List publishers
app.get('/api/publishers', (req, res) => {
  res.json({ publishers: Array.from(publishers.values()) });
});

// Get publisher
app.get('/api/publishers/:id', (req, res) => {
  const publisher = publishers.get(req.params.id);
  if (!publisher) {
    return res.status(404).json({ error: 'Publisher not found' });
  }
  res.json(publisher);
});

// Create publisher
app.post('/api/publishers', (req, res) => {
  const { name, config } = req.body;
  const id = `pub-${uuidv4().slice(0, 8)}`;
  const publisher = { id, name, config: config || {} };
  publishers.set(id, publisher);
  res.status(201).json(publisher);
});

// Update publisher
app.put('/api/publishers/:id', (req, res) => {
  const publisher = publishers.get(req.params.id);
  if (!publisher) {
    return res.status(404).json({ error: 'Publisher not found' });
  }

  const { name, config } = req.body;
  if (name) publisher.name = name;
  if (config) publisher.config = { ...publisher.config, ...config };

  res.json(publisher);
});

// Delete publisher
app.delete('/api/publishers/:id', (req, res) => {
  if (!publishers.has(req.params.id)) {
    return res.status(404).json({ error: 'Publisher not found' });
  }
  publishers.delete(req.params.id);
  res.json({ message: 'Publisher deleted' });
});

// ===============================
// Dashboard
// ===============================

app.get('/api/dashboard', (req, res) => {
  const allJobs = Array.from(jobs.values());

  res.json({
    totalJobs: allJobs.length,
    completed: allJobs.filter(j => j.status === 'completed').length,
    processing: allJobs.filter(j => j.status === 'processing').length,
    failed: allJobs.filter(j => j.status === 'failed').length,
    queued: allJobs.filter(j => j.status === 'queued').length,
    editing: allJobs.filter(j => j.status === 'editing').length,
    publisherCount: publishers.size,
    recentJobs: allJobs.slice(-10).reverse()
  });
});

// List all jobs
app.get('/api/jobs', (req, res) => {
  const allJobs = Array.from(jobs.values());
  res.json({ jobs: allJobs });
});

app.listen(PORT, () => {
  console.log(`Mock EPUB API running on port ${PORT}`);
  console.log(`Editor URL base: http://localhost:${EDITOR_PORT}`);
});
