import { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  FileText,
  BookOpen
} from 'lucide-react';
import BatchUploader from '../components/shared/BatchUploader';
import DataTable from '../components/shared/DataTable';
import { useBatchOperations } from '../hooks/useBatchOperations';
import { useConversionUpdates } from '../hooks/useRealtime';
import { getUserFiles, formatFileSize } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';

function BatchOperations() {
  const { showSuccess, showError, handleError } = useNotification();
  const {
    uploading,
    uploadProgress,
    deleting,
    downloading,
    error: batchError,
    uploadBatch,
    deleteBatch,
    downloadBatch,
    getBatchStatus
  } = useBatchOperations();

  // Batch history
  const [batches, setBatches] = useState([]);
  const [activeBatch, setActiveBatch] = useState(null); // { batchId, files, overall }
  const [batchFiles, setBatchFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Load user files grouped by batch
  const loadBatchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const result = await getUserFiles({ limit: 200 });
      const files = result.data?.files || result.files || [];

      // Group files by batchId
      const batchMap = {};
      const unbatched = [];
      for (const file of files) {
        if (file.batchId) {
          if (!batchMap[file.batchId]) {
            batchMap[file.batchId] = {
              batchId: file.batchId,
              files: [],
              createdAt: file.createdAt
            };
          }
          batchMap[file.batchId].files.push(file);
        } else {
          unbatched.push(file);
        }
      }

      const batchList = Object.values(batchMap).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setBatches(batchList);
      setBatchFiles(files);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadBatchFiles();
  }, [loadBatchFiles]);

  // Listen for real-time conversion updates
  useConversionUpdates(
    useCallback((event, data) => {
      // Refresh batch data when a conversion completes or fails
      if (event === 'conversion:completed' || event === 'conversion:failed') {
        loadBatchFiles();
        if (activeBatch) {
          getBatchStatus(activeBatch.batchId)
            .then(setActiveBatch)
            .catch(() => {});
        }
      }
    }, [activeBatch, loadBatchFiles, getBatchStatus])
  );

  const handleUpload = async (files) => {
    try {
      const result = await uploadBatch(files);
      showSuccess('Batch Upload', `${result.files?.length || 0} files uploaded successfully`);
      // Track active batch
      if (result.batchId) {
        const status = await getBatchStatus(result.batchId);
        setActiveBatch(status);
      }
      await loadBatchFiles();
      return result;
    } catch (err) {
      showError('Upload Failed', err.message);
      throw err;
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await deleteBatch(Array.from(selectedIds));
      showSuccess('Batch Delete', `${result.deleted} file(s) deleted`);
      setSelectedIds(new Set());
      await loadBatchFiles();
    } catch (err) {
      handleError(err, 'Batch delete failed');
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    try {
      await downloadBatch(Array.from(selectedIds));
      showSuccess('Download', 'Batch download started');
    } catch (err) {
      handleError(err, 'Batch download failed');
    }
  };

  const handleViewBatch = async (batch) => {
    try {
      const status = await getBatchStatus(batch.batchId);
      setActiveBatch(status);
    } catch {
      // Fallback to local data
      setActiveBatch({
        batchId: batch.batchId,
        files: batch.files.map((f) => ({
          id: f._id,
          name: f.originalName,
          status: f.status,
          fileType: f.fileType,
          fileSize: f.fileSize,
          createdAt: f.createdAt
        })),
        overall: {
          total: batch.files.length,
          completed: batch.files.filter((f) => f.status === 'completed').length,
          failed: batch.files.filter((f) => f.status === 'failed').length,
          processing: batch.files.filter((f) =>
            ['processing', 'pending', 'uploaded'].includes(f.status)
          ).length
        }
      });
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      case 'processing':
      case 'pending':
      case 'uploaded':
        return <Loader2 size={16} className="text-blue-500 animate-spin" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

  const statusLabel = (status) => {
    const colors = {
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      processing: 'bg-blue-100 text-blue-700',
      pending: 'bg-yellow-100 text-yellow-700',
      uploaded: 'bg-gray-100 text-gray-700'
    };
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {statusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // DataTable columns for batch files
  const fileColumns = [
    {
      key: 'originalName',
      label: 'File Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.fileType === 'epub' ? (
            <BookOpen size={16} className="text-green-500" />
          ) : (
            <FileText size={16} className="text-blue-500" />
          )}
          <span className="truncate max-w-xs">{row.originalName}</span>
        </div>
      )
    },
    {
      key: 'fileType',
      label: 'Type',
      render: (row) => (
        <span className="uppercase text-xs font-medium text-gray-500">{row.fileType}</span>
      )
    },
    {
      key: 'fileSize',
      label: 'Size',
      render: (row) => <span className="text-sm text-gray-600">{formatFileSize(row.fileSize)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => statusLabel(row.status)
    },
    {
      key: 'createdAt',
      label: 'Uploaded',
      render: (row) => (
        <span className="text-sm text-gray-500">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      )
    }
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 bg-secondary-50 dark:bg-secondary-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            Batch Operations
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 mt-1">
            Upload, manage, and process multiple files at once
          </p>
        </div>
        <button
          onClick={loadBatchFiles}
          disabled={loadingFiles}
          className="flex items-center gap-2 px-4 py-2 text-purple-600 dark:text-purple-400 border border-purple-600 dark:border-purple-500 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loadingFiles ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Batch Uploader */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-200 dark:border-secondary-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-secondary-100 mb-4">Upload Files</h2>
        <BatchUploader
          onUpload={handleUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />
      </div>

      {/* Active Batch Monitor */}
      {activeBatch && (
        <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-200 dark:border-secondary-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-secondary-100">Active Batch</h2>
            <button
              onClick={() => setActiveBatch(null)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-secondary-400 dark:hover:text-secondary-200"
            >
              Dismiss
            </button>
          </div>

          {/* Progress summary */}
          {activeBatch.overall && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-secondary-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-secondary-100">{activeBatch.overall.total}</p>
                <p className="text-xs text-gray-500 dark:text-secondary-400">Total</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{activeBatch.overall.completed}</p>
                <p className="text-xs text-green-600">Completed</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{activeBatch.overall.processing}</p>
                <p className="text-xs text-blue-600">Processing</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{activeBatch.overall.failed}</p>
                <p className="text-xs text-red-600">Failed</p>
              </div>
            </div>
          )}

          {/* Batch file list */}
          {activeBatch.files && activeBatch.files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {activeBatch.files.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-secondary-700 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-secondary-300 truncate flex-1">{f.name}</span>
                  {statusLabel(f.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Batch Actions + File Table */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-gray-200 dark:border-secondary-700">
        {/* Actions bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-secondary-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-secondary-100">All Files</h2>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-secondary-400 mr-2">{selectedIds.size} selected</span>
                <button
                  onClick={handleBatchDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Download
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Batch History quick links */}
        {batches.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-secondary-700/30 border-b border-gray-200 dark:border-secondary-700 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 dark:text-secondary-400 py-1">Batches:</span>
            {batches.slice(0, 8).map((b) => (
              <button
                key={b.batchId}
                onClick={() => handleViewBatch(b)}
                className="text-xs px-2.5 py-1 bg-white dark:bg-secondary-700 border border-gray-300 dark:border-secondary-600 rounded-full hover:border-purple-400 hover:text-purple-600 dark:text-secondary-300 dark:hover:text-purple-400 transition-colors"
              >
                {b.batchId.slice(0, 16)}... ({b.files.length} files)
              </button>
            ))}
          </div>
        )}

        {/* Data table */}
        <div className="p-6">
          <DataTable
            columns={fileColumns}
            data={batchFiles}
            loading={loadingFiles}
            selectable={true}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage="No files yet. Upload files above to get started."
          />
        </div>
      </div>

      {/* Error display */}
      {batchError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-red-800 dark:text-red-400">Error</p>
            <p className="text-sm text-red-600 dark:text-red-400/80">{batchError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchOperations;
