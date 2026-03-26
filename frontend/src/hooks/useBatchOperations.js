import { useState, useCallback } from 'react';
import {
  uploadBatch as uploadBatchApi,
  deleteBatch as deleteBatchApi,
  downloadBatch as downloadBatchApi,
  getBatchStatus as getBatchStatusApi
} from '../utils/api';

/**
 * Hook for batch file operations: upload, delete, download, status.
 */
export const useBatchOperations = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const uploadBatch = useCallback(async (files) => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const result = await uploadBatchApi(files, ({ progress }) => {
        setUploadProgress(progress);
      });
      return result;
    } catch (err) {
      setError(err.message || 'Batch upload failed');
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const deleteBatch = useCallback(async (fileIds) => {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteBatchApi(fileIds);
      return result;
    } catch (err) {
      setError(err.message || 'Batch delete failed');
      throw err;
    } finally {
      setDeleting(false);
    }
  }, []);

  const downloadBatch = useCallback(async (fileIds) => {
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadBatchApi(fileIds);
      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch-download-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      setError(err.message || 'Batch download failed');
      throw err;
    } finally {
      setDownloading(false);
    }
  }, []);

  const fetchBatchStatus = useCallback(async (batchId) => {
    setError(null);
    try {
      const result = await getBatchStatusApi(batchId);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to get batch status');
      throw err;
    }
  }, []);

  return {
    uploading,
    uploadProgress,
    deleting,
    downloading,
    error,
    uploadBatch,
    deleteBatch,
    downloadBatch,
    getBatchStatus: fetchBatchStatus
  };
};

export default useBatchOperations;
