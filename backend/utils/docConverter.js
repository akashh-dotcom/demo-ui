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

    console.log('Starting conversion:', inputFilePath);

    const pyProcess = spawn(
      pythonPath,
      [converterScriptPath, inputFilePath, outputDir],
      { shell: true }
    );

    // Set timeout (default: 30 minutes, configurable via env)
    const timeoutMs = parseInt(process.env.CONVERTER_TIMEOUT_MS || '1800000', 10);
    const timeoutId = setTimeout(() => {
      console.error(`Conversion timeout after ${timeoutMs}ms, killing process`);
      pyProcess.kill('SIGTERM');

      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (!pyProcess.killed) {
          console.error('Process did not terminate, force killing');
          pyProcess.kill('SIGKILL');
        }
      }, 5000);

      reject({
        success: false,
        message: 'Conversion timeout - process took too long',
        timeout: timeoutMs
      });
    }, timeoutMs);

    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
      const str = data.toString();
      stdoutData += str;
      process.stdout.write(str);
    });

    pyProcess.stderr.on('data', (data) => {
      const str = data.toString();
      stderrData += str;
      process.stderr.write(str);
    });

    pyProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      console.error('Python process error:', error);
      reject({
        success: false,
        message: 'Failed to start Python process',
        error: error.message
      });
    });

    pyProcess.on('close', async (code, signal) => {
      clearTimeout(timeoutId);

      if (signal) {
        console.error(`Process killed with signal: ${signal}`);
        return reject({
          success: false,
          message: `Conversion process was killed (${signal})`,
          signal
        });
      }

      if (code !== 0) {
        console.error(`Process exited with code ${code}`);
        console.error('stderr output:', stderrData);
        return reject({
          success: false,
          message: 'Conversion failed',
          code,
          stderr: stderrData.slice(-500) // Last 500 chars of stderr
        });
      }

      try {
        const outputFiles = await getOutputFiles(outputDir);

        if (outputFiles.length === 0) {
          console.warn('No output files generated');
          return reject({
            success: false,
            message: 'Conversion completed but no output files were generated'
          });
        }

        console.log(`Conversion successful, generated ${outputFiles.length} files`);
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
