const { exec } = require('child_process');
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
    // Ensure output directory exists
    if (!fsSync.existsSync(outputDir)) {
      fsSync.mkdirSync(outputDir, { recursive: true });
    }

    // Path to integrated_pipeline.py (note: no 's' at the end)
    // Adjust this path based on where RittDocConverter is cloned
    const converterScriptPath = process.env.CONVERTER_SCRIPT_PATH ||
                                path.join(__dirname, '../../RittDocConverter/integrated_pipeline.py');

    // Check if script exists
    if (!fsSync.existsSync(converterScriptPath)) {
      return reject({
        success: false,
        message: `RittDocConverter script not found at: ${converterScriptPath}`,
        error: 'Please set CONVERTER_SCRIPT_PATH in your .env file or clone RittDocConverter to the correct location'
      });
    }

    // Determine Python command based on platform
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    // Build command with proper quoting for Windows
    const command = `"${pythonCmd}" "${converterScriptPath}" --input "${inputFilePath}" --output "${outputDir}"`;

    console.log('Executing conversion command:', command);

    // Set environment variables to handle Unicode on Windows
    const execOptions = {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',  // Force UTF-8 encoding for Python I/O
        PYTHONLEGACYWINDOWSSTDIO: '1'  // Enable UTF-8 on Windows legacy console
      },
      encoding: 'utf8'
    };

    exec(command, execOptions, async (error, stdout, stderr) => {
      // Check if there are output files even if there's an error
      // (RittDocConverter might print errors but still produce output)
      let outputFiles = [];
      try {
        outputFiles = await getOutputFiles(outputDir);
      } catch (err) {
        console.error('Error reading output files:', err);
      }

      if (error) {
        console.error('Conversion error:', error);
        console.error('stderr:', stderr);

        // If we have output files despite the error, consider it a partial success
        if (outputFiles.length > 0) {
          console.log('Warning: Conversion completed with errors, but output files were generated');
          return resolve({
            success: true,
            message: 'Document converted with warnings',
            outputPath: outputDir,
            outputFiles: outputFiles,
            stdout: stdout,
            stderr: stderr,
            warnings: error.message
          });
        }

        return reject({
          success: false,
          message: 'Document conversion failed',
          error: error.message,
          stderr: stderr
        });
      }

      try {
        resolve({
          success: true,
          message: 'Document converted successfully',
          outputPath: outputDir,
          outputFiles: outputFiles,
          stdout: stdout,
          stderr: stderr
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
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const outputFiles = [];

    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(dirPath, file.name);
        const stats = await fs.stat(filePath);
        const ext = path.extname(file.name).toLowerCase();

        outputFiles.push({
          fileName: file.name,
          filePath: filePath,
          fileType: ext.replace('.', ''),
          fileSize: stats.size
        });
      } else if (file.isDirectory()) {
        // Recursively get files from subdirectories
        const subDirPath = path.join(dirPath, file.name);
        const subFiles = await getOutputFiles(subDirPath);
        outputFiles.push(...subFiles);
      }
    }

    return outputFiles;
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
};

/**
 * Clean up uploaded file
 * @param {string} filePath - File path to delete
 */
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log('Cleaned up file:', filePath);
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
};

/**
 * Clean up directory
 * @param {string} dirPath - Directory path to delete
 */
const cleanupDirectory = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log('Cleaned up directory:', dirPath);
  } catch (error) {
    console.error('Error cleaning up directory:', error);
  }
};

module.exports = {
  executeConverter,
  getOutputFiles,
  cleanupFile,
  cleanupDirectory
};
