const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

/**
 * Execute RittDocConverter pipeline
 * @param {string} inputFilePath - Path to the input file (PDF or EPUB)
 * @param {string} outputDir - Directory for output files
 * @returns {Promise<Object>} - Result object with output files info
 */
const executeConverter = async (inputFilePath, outputDir) => {
  return new Promise((resolve, reject) => {
    // Validate input
    if (!inputFilePath || typeof inputFilePath !== 'string') {
      return reject({ success: false, message: 'Invalid input file path' });
    }
    if (!outputDir || typeof outputDir !== 'string') {
      return reject({ success: false, message: 'Invalid output directory' });
    }
    if (!fsSync.existsSync(inputFilePath)) {
      return reject({ success: false, message: 'Input file not found', file: inputFilePath });
    }

    // Ensure output directory exists
    if (!fsSync.existsSync(outputDir)) {
      fsSync.mkdirSync(outputDir, { recursive: true });
    }

    

    // Get paths
    const pythonPath = process.env.CONVERTER_PYTHON || 'python';
    const converterScriptPath = process.env.CONVERTER_SCRIPT_PATH ||
      path.join(__dirname, '../../RittDocConverter/integrated_pipeline.py');

    console.log('========================================');
    console.log('Starting conversion process');
    console.log('Input file:', inputFilePath);
    console.log('Output directory:', outputDir);
    console.log('Python path:', pythonPath);
    console.log('Converter script:', converterScriptPath);
    console.log('========================================');

    // Check if converter script exists
    if (!fsSync.existsSync(converterScriptPath)) {
      return reject({
        success: false,
        message: `Converter script not found at: ${converterScriptPath}`,
        error: 'Please ensure RittDocConverter is installed and CONVERTER_SCRIPT_PATH is set correctly in .env'
      });
    }

    const pyProcess = spawn(
      pythonPath,
      [converterScriptPath, inputFilePath, outputDir],
      { shell: true }
    );

    // Handle spawn errors (e.g., Python not found)
    pyProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      reject({
        success: false,
        message: 'Failed to start conversion process',
        error: error.message
      });
    });

    pyProcess.stdout.on('data', (data) => {
      console.log('[CONVERTER STDOUT]:', data.toString());
      process.stdout.write(data.toString());
    });

    pyProcess.stderr.on('data', (data) => {
      console.error('[CONVERTER STDERR]:', data.toString());
      process.stderr.write(data.toString());
    });

    pyProcess.on('close', async (code) => {
      console.log(`Python process exited with code: ${code}`);
      if (code !== 0) {
        return reject({
          success: false,
          message: 'Conversion failed',
          code
        });
      }

      try {
        const outputFiles = await getOutputFiles(outputDir);
        resolve({
          success: true,
          message: 'Document converted successfully',
          outputPath: outputDir,
          outputFiles
        });
      } catch (err) {
        reject({
          success: false,
          message: 'Error reading output files',
          error: err.message
        });
      }
    });
  });
};

/**
 * Get list of output files from directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array>} - Array of file objects
 */
const getOutputFiles = async (dirPath) => {
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  let outputFiles = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isFile()) {
      const stats = await fs.stat(fullPath);
      const ext = path.extname(file.name).toLowerCase();
      outputFiles.push({
        fileName: file.name,
        filePath: fullPath,
        fileType: ext.replace('.', ''),
        fileSize: stats.size
      });
    } else if (file.isDirectory()) {
      const subFiles = await getOutputFiles(fullPath);
      outputFiles = outputFiles.concat(subFiles);
    }
  }

  return outputFiles;
};

/**
 * Delete a file
 * @param {string} filePath
 */
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log('Cleaned up file:', filePath);
  } catch (err) {
    console.error('Error cleaning up file:', err);
  }
};

/**
 * Delete a directory recursively
 * @param {string} dirPath
 */
const cleanupDirectory = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log('Cleaned up directory:', dirPath);
  } catch (err) {
    console.error('Error cleaning up directory:', err);
  }
};

module.exports = {
  executeConverter,
  getOutputFiles,
  cleanupFile,
  cleanupDirectory
};
