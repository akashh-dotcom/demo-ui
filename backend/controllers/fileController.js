const File = require('../models/File');
const User = require('../models/User');
const ConversionRecord = require('../models/ConversionRecord');
const path = require('path');
const fs = require('fs');

// Legacy local converter (will be deprecated)
const { executeConverter, cleanupFile, cleanupDirectory } = require('../utils/docConverter');

// External API services
const pdfApiService = require('../services/pdfApiService');
const epubApiService = require('../services/epubApiService');

const {
  uploadFileToGridFS,
  uploadMultipleToGridFS,
  deleteFromGridFS,
  downloadFromGridFS,
  downloadToLocal
} = require('../utils/gridfs');
const {
  sendConversionSuccessEmail,
  sendConversionFailureEmail
} = require('../utils/emailService');

// Feature flag: use external APIs (set to true to enable)
const USE_EXTERNAL_APIS = process.env.USE_EXTERNAL_APIS === 'true';

// @desc    Upload and process file
// @route   POST /api/files/upload
// @access  Private
const uploadFile = async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { originalname, filename, path: filePath, size, mimetype } = req.file;
    const fileType = path.extname(originalname).toLowerCase().replace('.', '');
    tempFilePath = filePath;

    // Get optional output folder path from request body
    const outputFolderPath = req.body.outputFolderPath || null;

    console.log(`Uploading file to GridFS: ${originalname}`);
    if (outputFolderPath) {
      console.log(`Output folder path specified: ${outputFolderPath}`);
    }

    // Upload file to GridFS
    const gridfsResult = await uploadFileToGridFS(req.file, {
      uploadedBy: req.user._id,
      fileType: fileType
    });

    console.log(`File uploaded to GridFS with ID: ${gridfsResult.fileId}`);

    // Save file record in DB with GridFS reference
    const file = await File.create({
      originalName: originalname,
      fileName: filename,
      filePath: null,  // Not using local storage anymore
      gridfsInputFileId: gridfsResult.fileId,
      storedInGridFS: true,
      fileType: fileType,
      fileSize: size,
      mimeType: mimetype,
      uploadedBy: req.user._id,
      outputFolderPath: outputFolderPath,  // Store user's output folder preference
      status: 'uploaded'
    });

    // Clean up temporary uploaded file
    await cleanupFile(tempFilePath);
    console.log(`Cleaned up temporary file: ${tempFilePath}`);

    // Start async processing (don't wait for it to complete)
    if (USE_EXTERNAL_APIS) {
      processFileWithExternalApi(file);
    } else {
      processFileAsync(file);  // Legacy local processing
    }

    // Return immediate response - processing will continue in background
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully, processing started',
      data: { file }
    });
  } catch (error) {
    // Clean up temporary file in case of error
    if (tempFilePath) {
      await cleanupFile(tempFilePath);
    }

    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
};

// @desc    Process file asynchronously
const processFileAsync = async (file) => {
  let tempInputPath = null;
  let outputDir = null;

  try {
    // Validate file object
    if (!file || !file._id || !file.gridfsInputFileId) {
      console.error('Invalid file object passed to processFileAsync:', file);
      throw new Error('Invalid file object - missing GridFS input file ID');
    }

    // Update status to processing
    await file.updateStatus('processing');

    // Create temporary directory for this file's processing
    const tempDir = path.join(__dirname, '../temp', file._id.toString());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download input file from GridFS to temporary location
    tempInputPath = path.join(tempDir, file.originalName);
    console.log(`Downloading input file from GridFS to: ${tempInputPath}`);
    await downloadToLocal(file.gridfsInputFileId, tempInputPath);
    console.log(`Input file downloaded successfully`);

    // Create output directory for this file
    outputDir = path.join(tempDir, 'output');

    const fileIdString = file._id.toString();
    console.log(`Processing file ${fileIdString}: ${file.originalName}`);

    // Execute converter (automatically detects PDF or EPUB)
    const result = await executeConverter(tempInputPath, outputDir);

    // Upload output files to GridFS
    console.log(`Uploading ${result.outputFiles.length} output files to GridFS...`);
    const gridfsFiles = await uploadMultipleToGridFS(
      result.outputFiles,
      {
        sourceFileId: file._id,
        uploadedBy: file.uploadedBy,
        conversionType: result.converterType || 'Unknown'  // ✅ CHANGE #1: Dynamic converter type
      }
    );

    // Map GridFS file info to output files array (no local filePath)
    const outputFilesWithGridFS = result.outputFiles.map((file, index) => ({
      fileName: file.fileName,
      filePath: null,  // Not storing local path anymore
      fileType: file.fileType,
      fileSize: file.fileSize,
      gridfsFileId: gridfsFiles[index].fileId,
      storedInGridFS: true
    }));

    // Update file record with results (no outputPath)
    await file.updateStatus('completed', {
      outputPath: null,  // Not using local storage anymore
      outputFiles: outputFilesWithGridFS,
      conversionMetadata: {
        conversionType: result.converterType || 'Unknown',  // ✅ CHANGE #2: Dynamic converter type
        outputFormats: result.outputFiles.map(f => f.fileType)
      }
    });

    console.log(`File ${file._id} processed successfully and uploaded to GridFS`);

    // Send success email notification
    try {
      const user = await User.findById(file.uploadedBy);
      if (user && user.email) {
        const emailResult = await sendConversionSuccessEmail(
          user.email,
          file.originalName,
          outputFilesWithGridFS,
          file._id
        );
        if (emailResult.success) {
          console.log(`Success email sent to ${user.email}`);
        } else {
          console.error(`Failed to send success email to ${user.email}:`, emailResult.error || emailResult.message);
        }
      }
    } catch (emailError) {
      console.error('Failed to send success email:', emailError);
      // Don't fail the process if email fails
    }

    // Clean up all temporary files
    try {
      await cleanupDirectory(tempDir);
      console.log(`Cleaned up temporary directory: ${tempDir}`);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary directory:', cleanupError);
      // Don't fail the process if cleanup fails
    }

  } catch (error) {
    console.error(`File processing failed:`, error);

    // Clean up temporary files in case of error
    if (outputDir) {
      try {
        const tempDir = path.dirname(outputDir);
        await cleanupDirectory(tempDir);
        console.log(`Cleaned up temporary directory after error: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary directory after error:', cleanupError);
      }
    }

    // Try to update status to failed if file object is valid
    if (file && file.updateStatus) {
      try {
        const errorMessage = error.message || error.error || 'Conversion failed';
        await file.updateStatus('failed', {
          errorMessage: errorMessage
        });

        // Send failure email notification
        try {
          const user = await User.findById(file.uploadedBy);
          if (user && user.email) {
            const emailResult = await sendConversionFailureEmail(
              user.email,
              file.originalName,
              errorMessage
            );
            if (emailResult.success) {
              console.log(`Failure email sent to ${user.email}`);
            } else {
              console.error(`Failed to send failure email to ${user.email}:`, emailResult.error || emailResult.message);
            }
          }
        } catch (emailError) {
          console.error('Failed to send failure email:', emailError);
          // Don't fail the process if email fails
        }
      } catch (updateError) {
        console.error('Failed to update file status:', updateError);
      }
    }
  }
};

// @desc    Process file using external PDF/EPUB APIs
const processFileWithExternalApi = async (file) => {
  let tempInputPath = null;

  try {
    // Validate file object
    if (!file || !file._id || !file.gridfsInputFileId) {
      console.error('Invalid file object passed to processFileWithExternalApi:', file);
      throw new Error('Invalid file object - missing GridFS input file ID');
    }

    // Update status to pending (waiting for external API)
    await file.updateStatus('pending');

    // Create temporary directory for this file's processing
    const tempDir = path.join(__dirname, '../temp', file._id.toString());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download input file from GridFS to temporary location
    tempInputPath = path.join(tempDir, file.originalName);
    console.log(`Downloading input file from GridFS to: ${tempInputPath}`);
    await downloadToLocal(file.gridfsInputFileId, tempInputPath);
    console.log(`Input file downloaded successfully`);

    let job;
    let apiService;
    let externalService;

    // Route to appropriate API based on file type
    if (file.fileType === 'pdf') {
      console.log(`Sending PDF to external PDF API: ${file.originalName}`);
      apiService = pdfApiService;
      externalService = 'pdf';
      job = await pdfApiService.startConversion(tempInputPath, {});
    } else if (file.fileType === 'epub') {
      console.log(`Sending EPUB to external EPUB API: ${file.originalName}`);
      apiService = epubApiService;
      externalService = 'epub';
      job = await epubApiService.startConversion(tempInputPath, {});
    } else {
      throw new Error(`Unsupported file type: ${file.fileType}`);
    }

    // Store external job ID
    file.externalJobId = job.job_id;
    file.externalService = externalService;
    await file.save();

    console.log(`External job started: ${job.job_id} (${externalService})`);

    // Update status to processing
    await file.updateStatus('processing');

    // Record conversion start in tracking database
    try {
      const user = await User.findById(file.uploadedBy);
      await ConversionRecord.recordStart(file, user || { _id: file.uploadedBy });
      await ConversionRecord.recordProcessing(file._id, job.job_id);
    } catch (trackingError) {
      console.error('Failed to record conversion start:', trackingError);
      // Don't fail the conversion if tracking fails
    }

    // Poll for completion
    const completedJob = await apiService.pollJobUntil(
      job.job_id,
      apiService.ACTIONABLE_STATUSES || apiService.TERMINAL_STATUSES,
      (statusUpdate) => {
        console.log(`Job ${job.job_id} status: ${statusUpdate.status} (${statusUpdate.progress || 0}%)`);
      }
    );

    if (completedJob.status === 'failed') {
      throw new Error(completedJob.error || 'External conversion failed');
    }

    // Conversion completed - download output files
    if (completedJob.status === 'completed') {
      // Download output files from external API
      const outputDir = path.join(tempDir, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let outputFiles = [];

      if (externalService === 'pdf') {
        // PDF API: List and download files
        const filesResponse = await pdfApiService.listOutputFiles(job.job_id);
        for (const outputFile of filesResponse.files || []) {
          const localPath = path.join(outputDir, outputFile.name);
          await pdfApiService.downloadFile(job.job_id, outputFile.name, localPath);
          outputFiles.push({
            filePath: localPath,
            fileName: outputFile.name,
            fileType: path.extname(outputFile.name).replace('.', ''),
            fileSize: outputFile.size || fs.statSync(localPath).size
          });
        }
      } else if (externalService === 'epub') {
        // EPUB API: Download result ZIP
        // Try to get ISBN from job metadata for better naming
        let zipFileName;
        const isbn = completedJob.metadata?.isbn || completedJob.isbn;
        if (isbn && isbn !== 'UNKNOWN' && isbn.match(/^[\d-X]+$/)) {
          // Clean ISBN (remove hyphens) and use as filename
          zipFileName = `${isbn.replace(/-/g, '')}.zip`;
        } else {
          // Fall back to original filename (case-insensitive extension removal)
          const baseName = file.originalName.replace(/\.epub$/i, '');
          zipFileName = `${baseName}_output.zip`;
        }
        const zipPath = path.join(outputDir, zipFileName);
        await epubApiService.downloadResult(job.job_id, zipPath);
        const stats = fs.statSync(zipPath);
        outputFiles.push({
          filePath: zipPath,
          fileName: path.basename(zipPath),
          fileType: 'zip',
          fileSize: stats.size
        });

        // Store ISBN in conversion metadata if available
        if (isbn && isbn !== 'UNKNOWN') {
          file.conversionMetadata = {
            ...file.conversionMetadata,
            isbn: isbn.replace(/-/g, '')
          };
        }
      }

      // Upload output files to GridFS
      console.log(`Uploading ${outputFiles.length} output files to GridFS...`);
      const gridfsFiles = await uploadMultipleToGridFS(
        outputFiles,
        {
          sourceFileId: file._id,
          uploadedBy: file.uploadedBy,
          conversionType: externalService.toUpperCase()
        }
      );

      // Map GridFS file info to output files array
      const outputFilesWithGridFS = outputFiles.map((f, index) => ({
        fileName: f.fileName,
        filePath: null,
        fileType: f.fileType,
        fileSize: f.fileSize,
        gridfsFileId: gridfsFiles[index].fileId,
        storedInGridFS: true
      }));

      // Update file record with results
      await file.updateStatus('completed', {
        outputPath: null,
        outputFiles: outputFilesWithGridFS,
        conversionMetadata: {
          conversionType: externalService.toUpperCase(),
          outputFormats: outputFiles.map(f => f.fileType)
        }
      });

      console.log(`File ${file._id} processed successfully via ${externalService} API`);

      // Record completion in tracking database
      try {
        const isbn = completedJob.metadata?.isbn || completedJob.isbn;
        await ConversionRecord.recordComplete(file._id, outputFilesWithGridFS, {
          isbn: isbn?.replace(/-/g, ''),
          title: completedJob.metadata?.title,
          author: completedJob.metadata?.author,
          publisher: completedJob.metadata?.publisher,
          metrics: completedJob.metadata?.metrics,
          quality: completedJob.metadata?.quality
        });
      } catch (trackingError) {
        console.error('Failed to record completion:', trackingError);
      }

      // Send success email notification
      try {
        const user = await User.findById(file.uploadedBy);
        if (user && user.email) {
          await sendConversionSuccessEmail(
            user.email,
            file.originalName,
            outputFilesWithGridFS,
            file._id
          );
          console.log(`Success email sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error('Failed to send success email:', emailError);
      }

      // Clean up temporary files
      try {
        await cleanupDirectory(tempDir);
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary directory:', cleanupError);
      }
    }

  } catch (error) {
    console.error(`External API processing failed:`, error);

    // Clean up temporary files
    if (tempInputPath) {
      try {
        const tempDir = path.dirname(tempInputPath);
        await cleanupDirectory(tempDir);
      } catch (cleanupError) {
        console.error('Error cleaning up after failure:', cleanupError);
      }
    }

    // Update status to failed
    if (file && file.updateStatus) {
      try {
        const errorMessage = error.message || 'External conversion failed';
        await file.updateStatus('failed', {
          errorMessage: errorMessage
        });

        // Record failure in tracking database
        try {
          await ConversionRecord.recordFailure(file._id, errorMessage);
        } catch (trackingError) {
          console.error('Failed to record failure:', trackingError);
        }

        // Send failure email
        try {
          const user = await User.findById(file.uploadedBy);
          if (user && user.email) {
            await sendConversionFailureEmail(user.email, file.originalName, errorMessage);
            console.log(`Failure email sent to ${user.email}`);
          }
        } catch (emailError) {
          console.error('Failed to send failure email:', emailError);
        }
      } catch (updateError) {
        console.error('Failed to update file status:', updateError);
      }
    }
  }
};

// @desc    Launch editor for a file (PDF API only)
// @route   POST /api/files/:id/editor
// @access  Private
const launchEditor = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Check ownership
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if file is completed (editor is optional post-completion feature)
    if (file.status !== 'completed' && file.status !== 'editing') {
      return res.status(400).json({
        success: false,
        message: `Cannot launch editor. File status is '${file.status}', expected 'completed'`
      });
    }

    let editorUrl;

    if (file.externalService === 'pdf') {
      const result = await pdfApiService.launchEditor(file.externalJobId);
      editorUrl = result.editor_url;
    } else if (file.externalService === 'epub') {
      // EPUB uses separate editor service
      // Get the public URL for browser access
      editorUrl = epubApiService.getEditorUrl();

      // Log the URL for debugging
      console.log('EPUB Editor URLs:');
      console.log('  - Internal (EPUB_EDITOR_URL):', process.env.EPUB_EDITOR_URL || 'not set');
      console.log('  - Public (EPUB_EDITOR_PUBLIC_URL):', process.env.EPUB_EDITOR_PUBLIC_URL || 'not set');
      console.log('  - Returned URL:', editorUrl);

      // Try to load the package into the editor using the job ID
      try {
        // The EPUB API should have the output package path
        const jobStatus = await epubApiService.getJobStatus(file.externalJobId);
        if (jobStatus.output_path) {
          console.log('Loading EPUB package into editor:', jobStatus.output_path);
          await epubApiService.loadPackageInEditor(jobStatus.output_path);
        }
      } catch (loadError) {
        console.log('Could not pre-load package into editor:', loadError.message);
        // Continue anyway - user may need to load manually
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Editor not available for this file type'
      });
    }

    // Update file status
    await file.updateStatus('editing', { editorUrl });

    res.status(200).json({
      success: true,
      data: {
        editorUrl,
        fileId: file._id,
        externalJobId: file.externalJobId
      }
    });
  } catch (error) {
    console.error('Error launching editor:', error);
    res.status(500).json({
      success: false,
      message: 'Error launching editor',
      error: error.message
    });
  }
};

// @desc    Refresh output files after editing (PDF and EPUB)
// @route   POST /api/files/:id/finalize
// @access  Private
// Note: This endpoint refreshes/re-downloads output files after editing.
// The PDF API no longer requires a separate "finalize" step - files are ready immediately.
const finalizeFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Check ownership
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if file can be refreshed (must be editing or completed)
    if (!['editing', 'completed'].includes(file.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot refresh files. File status is '${file.status}'`
      });
    }

    const tempDir = path.join(__dirname, '../temp', file._id.toString());
    const outputDir = path.join(tempDir, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let outputFiles = [];

    if (file.externalService === 'pdf') {
      // PDF: Files are ready immediately - just refresh/re-download
      // No finalize call needed anymore
      const filesResponse = await pdfApiService.listOutputFiles(file.externalJobId);
      for (const outputFile of filesResponse.files || []) {
        const localPath = path.join(outputDir, outputFile.name);
        // Create subdirectories if needed (e.g., MultiMedia/image.png)
        const localDir = path.dirname(localPath);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        await pdfApiService.downloadFile(file.externalJobId, outputFile.name, localPath);
        outputFiles.push({
          filePath: localPath,
          fileName: outputFile.name,
          fileType: path.extname(outputFile.name).replace('.', ''),
          fileSize: outputFile.size || fs.statSync(localPath).size
        });
      }

    } else if (file.externalService === 'epub') {
      // EPUB: Save package and download result
      try {
        // Save the current state in the editor
        await epubApiService.savePackage();
      } catch (saveError) {
        console.log('Save package call failed (editor may not be open):', saveError.message);
        // Continue anyway - the package may already be saved
      }

      // Download the result ZIP
      // Try to get ISBN from existing metadata for naming
      let zipFileName;
      const isbn = file.conversionMetadata?.isbn;
      if (isbn && isbn !== 'UNKNOWN' && isbn.match(/^[\d-X]+$/)) {
        zipFileName = `${isbn.replace(/-/g, '')}.zip`;
      } else {
        // Case-insensitive extension removal
        const baseName = file.originalName.replace(/\.epub$/i, '');
        zipFileName = `${baseName}_output.zip`;
      }

      const zipPath = path.join(outputDir, zipFileName);
      await epubApiService.downloadResult(file.externalJobId, zipPath);
      const stats = fs.statSync(zipPath);

      outputFiles.push({
        filePath: zipPath,
        fileName: path.basename(zipPath),
        fileType: 'zip',
        fileSize: stats.size
      });

    } else {
      throw new Error(`Unsupported external service: ${file.externalService}`);
    }

    // Upload to GridFS
    const gridfsFiles = await uploadMultipleToGridFS(outputFiles, {
      sourceFileId: file._id,
      uploadedBy: file.uploadedBy,
      conversionType: file.externalService.toUpperCase()
    });

    const outputFilesWithGridFS = outputFiles.map((f, index) => ({
      fileName: f.fileName,
      filePath: null,
      fileType: f.fileType,
      fileSize: f.fileSize,
      gridfsFileId: gridfsFiles[index].fileId,
      storedInGridFS: true
    }));

    // Update file status
    await file.updateStatus('completed', {
      outputFiles: outputFilesWithGridFS,
      editorUrl: null
    });

    // Record completion in tracking database
    try {
      await ConversionRecord.recordComplete(file._id, outputFilesWithGridFS, {
        isbn: file.conversionMetadata?.isbn
      });
    } catch (trackingError) {
      console.error('Failed to record completion:', trackingError);
    }

    // Clean up temp files
    try {
      await cleanupDirectory(tempDir);
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    // Send success email
    try {
      const user = await User.findById(file.uploadedBy);
      if (user && user.email) {
        await sendConversionSuccessEmail(user.email, file.originalName, outputFilesWithGridFS, file._id);
      }
    } catch (emailError) {
      console.error('Email error:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'File finalized successfully',
      data: { file: await File.findById(file._id).populate('uploadedBy', 'username email') }
    });

  } catch (error) {
    console.error('Error finalizing file:', error);

    // Update status to failed
    if (req.params.id) {
      try {
        await File.findByIdAndUpdate(req.params.id, {
          status: 'failed',
          errorMessage: error.message
        });
      } catch (e) {
        console.error('Failed to update status:', e);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error finalizing file',
      error: error.message
    });
  }
};

// @desc    Get all files for current user
// @route   GET /api/files
// @access  Private
const getUserFiles = async (req, res) => {
  try {
    const files = await File.find({ uploadedBy: req.user._id })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'username email');

    res.status(200).json({
      success: true,
      count: files.length,
      data: { files }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
};

// @desc    Get all files (Admin only)
// @route   GET /api/files/all
// @access  Private/Admin
const getAllFiles = async (req, res) => {
  try {
    const files = await File.find()
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'username email');

    res.status(200).json({
      success: true,
      count: files.length,
      data: { files }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
};

// @desc    Get file by ID
// @route   GET /api/files/:id
// @access  Private
const getFileById = async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('uploadedBy', 'username email');

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check if user owns the file or is admin
    if (file.uploadedBy._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { file }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching file',
      error: error.message
    });
  }
};

// @desc    Download output file
// @route   GET /api/files/:id/download/:fileName
// @access  Private
const downloadOutputFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check if user owns the file or is admin
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find the requested output file
    const outputFile = file.outputFiles.find(f => f.fileName === req.params.fileName);

    if (!outputFile) {
      return res.status(404).json({
        success: false,
        message: 'Output file not found'
      });
    }

    // Download from GridFS (all files are stored in GridFS)
    if (!outputFile.storedInGridFS || !outputFile.gridfsFileId) {
      return res.status(404).json({
        success: false,
        message: 'File not found in GridFS storage'
      });
    }

    // Download from GridFS
    const { downloadStream, fileName, contentType } = await downloadFromGridFS(outputFile.gridfsFileId);

    // Set headers
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`
    });

    // Pipe the GridFS stream to response
    downloadStream.pipe(res);

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
};

// @desc    Delete file
// @route   DELETE /api/files/:id
// @access  Private
const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check if user owns the file or is admin
    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete input file from GridFS
    if (file.gridfsInputFileId) {
      try {
        await deleteFromGridFS(file.gridfsInputFileId);
        console.log(`Deleted input file from GridFS: ${file.originalName}`);
      } catch (error) {
        console.error(`Error deleting input file from GridFS:`, error);
        // Continue with other deletions even if one fails
      }
    }

    // Delete output files from GridFS
    if (file.outputFiles && file.outputFiles.length > 0) {
      for (const outputFile of file.outputFiles) {
        if (outputFile.storedInGridFS && outputFile.gridfsFileId) {
          try {
            await deleteFromGridFS(outputFile.gridfsFileId);
            console.log(`Deleted output file from GridFS: ${outputFile.fileName}`);
          } catch (error) {
            console.error(`Error deleting GridFS file ${outputFile.fileName}:`, error);
            // Continue with other deletions even if one fails
          }
        }
      }
    }

    // Clean up any legacy local files (for backward compatibility)
    if (file.filePath) {
      await cleanupFile(file.filePath);
    }
    if (file.outputPath) {
      await cleanupDirectory(file.outputPath);
    }

    await file.deleteOne();

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
};

// @desc    Get conversion dashboard files (xlsx files)
// @route   GET /api/files/conversion-dashboard
// @access  Private/Admin
const getConversionDashboardFiles = async (req, res) => {
  try {
    // Query for files that have conversion_dashboard.xlsx in outputFiles array
    const files = await File.find({
      status: 'completed',
      storedInGridFS: true,
      'outputFiles.fileName': 'conversion_dashboard.xlsx'  // Exact match
    })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'username email');

    console.log(`Found ${files.length} files with conversion_dashboard.xlsx`);

    // Log file details for debugging
    files.forEach(file => {
      console.log(`File ID: ${file._id}, Original: ${file.originalName}`);
    });

    res.status(200).json({
      success: true,
      count: files.length,
      data: { files }
    });
  } catch (error) {
    console.error('Error fetching conversion dashboard files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversion dashboard files',
      error: error.message
    });
  }
};


// @desc    Get all conversion records with optional filtering
// @route   GET /api/files/conversion-records
// @access  Private/Admin
const getConversionRecords = async (req, res) => {
  try {
    const {
      status,
      fileType,
      startDate,
      endDate,
      search,
      limit = 100,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (fileType && fileType !== 'all') {
      query.fileType = fileType.toLowerCase();
    }
    if (startDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(startDate) };
    }
    if (endDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };
    }
    if (search) {
      query.$or = [
        { fileName: { $regex: search, $options: 'i' } },
        { isbn: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { uploadedByUsername: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const total = await ConversionRecord.countDocuments(query);

    // Get records with pagination and sorting
    const records = await ConversionRecord.find(query)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('uploadedBy', 'username email')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        records,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching conversion records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversion records',
      error: error.message
    });
  }
};

// @desc    Get conversion statistics/dashboard
// @route   GET /api/files/conversion-stats
// @access  Private/Admin
const getConversionStats = async (req, res) => {
  try {
    const { startDate, endDate, fileType } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (fileType) filters.fileType = fileType;

    const stats = await ConversionRecord.getDashboardStats(filters);
    const dailyStats = await ConversionRecord.getDailyStats(30);

    res.status(200).json({
      success: true,
      data: {
        summary: stats,
        daily: dailyStats
      }
    });
  } catch (error) {
    console.error('Error fetching conversion stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversion stats',
      error: error.message
    });
  }
};

// Helper function to save files to user's output folder
const saveToOutputFolder = async (file, outputFiles, isbn) => {
  if (!file.outputFolderPath) return outputFiles;

  // Create ISBN subfolder
  const isbnFolder = isbn || 'unknown';
  const targetDir = path.join(file.outputFolderPath, isbnFolder);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy each output file to the target directory
    for (const outputFile of outputFiles) {
      if (outputFile.filePath && fs.existsSync(outputFile.filePath)) {
        const targetPath = path.join(targetDir, outputFile.fileName);
        fs.copyFileSync(outputFile.filePath, targetPath);
        outputFile.localPath = targetPath;
        console.log(`Saved ${outputFile.fileName} to ${targetPath}`);
      }
    }
  } catch (err) {
    console.error('Error saving to output folder:', err);
    // Don't fail the whole process if saving to output folder fails
  }

  return outputFiles;
};

// @desc    Webhook for external editors to push completed packages
// @route   POST /api/files/webhook/complete
// @access  Internal (from PDF/EPUB editors)
const webhookComplete = async (req, res) => {
  try {
    const {
      jobId,
      status,
      fileType,
      metadata,
      // New fields from PDF API webhook payload
      filename,
      apiBaseUrl,
      links,
      outputFiles: webhookOutputFiles,
      outputPackage,
      error: webhookError,
      // EPUB-specific fields
      downloadUrls  // { package: "...", report: "...", info: "..." }
    } = req.body;

    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Missing jobId' });
    }

    console.log(`Webhook received: jobId=${jobId}, status=${status}, fileType=${fileType}`);
    if (links) {
      console.log(`Links provided: ${JSON.stringify(links)}`);
    }

    // Find file by external job ID
    const file = await File.findOne({ externalJobId: jobId });
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found for jobId: ' + jobId });
    }

    // Store external API info and links
    if (apiBaseUrl) {
      file.externalApiBaseUrl = apiBaseUrl;
    }
    if (links) {
      file.externalLinks = {
        job: links.job,
        files: links.files,
        rittdocPackage: links.rittdocPackage,
        wordDocument: links.wordDocument,
        validationReport: links.validationReport,
        docbookXml: links.docbookXml
      };
    }

    // If status is 'completed' or 'saved', download the output and finalize
    if (status === 'completed' || status === 'saved') {
      const tempDir = path.join(__dirname, '../temp', file._id.toString());
      const outputDir = path.join(tempDir, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let outputFiles = [];
      let isbn = metadata?.isbn || file.conversionMetadata?.isbn;

      if (file.externalService === 'pdf') {
        // Use the outputFiles from webhook if provided, otherwise list from API
        const filesToDownload = webhookOutputFiles || [];

        if (filesToDownload.length > 0) {
          // Download files using URLs from webhook payload
          for (const outputFile of filesToDownload) {
            const localPath = path.join(outputDir, outputFile.name);
            const localDir = path.dirname(localPath);
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }

            // Download from the provided URL or construct from API
            if (outputFile.downloadUrl) {
              // Download directly from provided URL
              const response = await fetch(outputFile.downloadUrl);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(localPath, Buffer.from(buffer));
              } else {
                console.error(`Failed to download ${outputFile.name}: ${response.status}`);
                continue;
              }
            } else {
              // Fall back to API download
              await pdfApiService.downloadFile(jobId, outputFile.name, localPath);
            }

            const stats = fs.statSync(localPath);
            outputFiles.push({
              filePath: localPath,
              fileName: outputFile.name,
              fileType: path.extname(outputFile.name).replace('.', ''),
              fileSize: stats.size,
              downloadType: outputFile.type || null  // e.g., 'rittdoc_package', 'validation_report'
            });
          }
        } else {
          // Fall back to listing files from API
          const filesResponse = await pdfApiService.listOutputFiles(jobId);
          for (const outputFile of filesResponse.files || []) {
            const localPath = path.join(outputDir, outputFile.name);
            const localDir = path.dirname(localPath);
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }
            await pdfApiService.downloadFile(jobId, outputFile.name, localPath);

            // Determine download type based on filename
            let downloadType = null;
            if (outputFile.name.includes('_rittdoc.zip')) downloadType = 'rittdoc_package';
            else if (outputFile.name.endsWith('.docx')) downloadType = 'word_document';
            else if (outputFile.name.includes('_validation_report.xlsx')) downloadType = 'validation_report';
            else if (outputFile.name.includes('_docbook42.xml')) downloadType = 'docbook_xml';

            outputFiles.push({
              filePath: localPath,
              fileName: outputFile.name,
              fileType: path.extname(outputFile.name).replace('.', ''),
              fileSize: outputFile.size || fs.statSync(localPath).size,
              downloadType: downloadType
            });
          }
        }
      } else if (file.externalService === 'epub') {
        // Download result ZIP and validation report from EPUB API
        let zipFileName;
        if (isbn && isbn !== 'UNKNOWN' && isbn.match(/^[\d-X]+$/)) {
          zipFileName = `${isbn.replace(/-/g, '')}.zip`;
        } else {
          // Case-insensitive extension removal
          const baseName = file.originalName.replace(/\.epub$/i, '');
          zipFileName = `${baseName}_output.zip`;
        }
        const zipPath = path.join(outputDir, zipFileName);

        // Download package - use downloadUrls if provided, otherwise fallback to epubApiService
        if (downloadUrls?.package) {
          console.log(`Downloading EPUB package from: ${downloadUrls.package}`);
          const response = await fetch(downloadUrls.package);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(zipPath, Buffer.from(buffer));
          } else {
            console.error(`Failed to download package: ${response.status}`);
            throw new Error(`Failed to download EPUB package: ${response.status}`);
          }
        } else {
          await epubApiService.downloadResult(jobId, zipPath);
        }

        const zipStats = fs.statSync(zipPath);
        outputFiles.push({
          filePath: zipPath,
          fileName: path.basename(zipPath),
          fileType: 'zip',
          fileSize: zipStats.size,
          downloadType: 'rittdoc_package'
        });

        // Download validation report if URL provided
        if (downloadUrls?.report) {
          const baseNameForReport = file.originalName.replace(/\.epub$/i, '');
          const reportFileName = isbn && isbn !== 'UNKNOWN'
            ? `${isbn.replace(/-/g, '')}_validation_report.xlsx`
            : `${baseNameForReport}_validation_report.xlsx`;
          const reportPath = path.join(outputDir, reportFileName);

          console.log(`Downloading EPUB validation report from: ${downloadUrls.report}`);
          const reportResponse = await fetch(downloadUrls.report);
          if (reportResponse.ok) {
            const buffer = await reportResponse.arrayBuffer();
            fs.writeFileSync(reportPath, Buffer.from(buffer));
            const reportStats = fs.statSync(reportPath);
            outputFiles.push({
              filePath: reportPath,
              fileName: reportFileName,
              fileType: 'xlsx',
              fileSize: reportStats.size,
              downloadType: 'validation_report'
            });
          } else {
            console.error(`Failed to download validation report: ${reportResponse.status}`);
            // Don't fail the whole process if validation report download fails
          }
        }

        // Store EPUB-specific links
        if (downloadUrls) {
          file.externalLinks = {
            ...file.externalLinks,
            rittdocPackage: downloadUrls.package,
            validationReport: downloadUrls.report,
            info: downloadUrls.info
          };
        }
      }

      // Save to user's output folder if specified
      outputFiles = await saveToOutputFolder(file, outputFiles, isbn);

      // Upload to GridFS
      const gridfsFiles = await uploadMultipleToGridFS(outputFiles, {
        sourceFileId: file._id,
        uploadedBy: file.uploadedBy,
        conversionType: file.externalService.toUpperCase()
      });

      const outputFilesWithGridFS = outputFiles.map((f, index) => ({
        fileName: f.fileName,
        filePath: null,
        fileType: f.fileType,
        fileSize: f.fileSize,
        downloadType: f.downloadType,
        gridfsFileId: gridfsFiles[index].fileId,
        storedInGridFS: true,
        localPath: f.localPath || null
      }));

      // Update file status to completed
      await file.updateStatus('completed', {
        outputFiles: outputFilesWithGridFS,
        editorUrl: null,
        externalApiBaseUrl: apiBaseUrl || file.externalApiBaseUrl,
        externalLinks: file.externalLinks,
        conversionMetadata: {
          ...file.conversionMetadata,
          ...metadata,
          isbn: isbn
        }
      });

      // Record completion in tracking database
      try {
        await ConversionRecord.recordComplete(file._id, outputFilesWithGridFS, {
          isbn: isbn,
          title: metadata?.title,
          author: metadata?.author,
          publisher: metadata?.publisher
        });
      } catch (trackingError) {
        console.error('Failed to record completion:', trackingError);
      }

      // Clean up temp files
      try {
        await cleanupDirectory(tempDir);
      } catch (e) {
        console.error('Cleanup error:', e);
      }

      // Send success email
      try {
        const user = await User.findById(file.uploadedBy);
        if (user && user.email) {
          await sendConversionSuccessEmail(user.email, file.originalName, outputFilesWithGridFS, file._id);
        }
      } catch (emailError) {
        console.error('Email error:', emailError);
      }

      console.log(`File ${file._id} completed via webhook`);
    } else if (status === 'failed') {
      const errorMessage = webhookError || metadata?.error || 'Processing failed';
      await file.updateStatus('failed', {
        errorMessage: errorMessage,
        externalApiBaseUrl: apiBaseUrl,
        externalLinks: links ? {
          job: links.job,
          files: links.files
        } : file.externalLinks
      });
      try {
        await ConversionRecord.recordFailure(file._id, errorMessage);
      } catch (e) {
        console.error('Failed to record failure:', e);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      fileId: file._id.toString()
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

module.exports = {
  uploadFile,
  getUserFiles,
  getAllFiles,
  getFileById,
  downloadOutputFile,
  deleteFile,
  getConversionDashboardFiles,
  getConversionRecords,
  getConversionStats,
  // External API endpoints
  launchEditor,
  finalizeFile,
  webhookComplete
};
