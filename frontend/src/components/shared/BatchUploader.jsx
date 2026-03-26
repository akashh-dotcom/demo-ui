import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Plus
} from 'lucide-react';
import { formatFileSize } from '../../utils/api';

/**
 * Multi-file drag-and-drop uploader with queue management.
 *
 * Props:
 *  - onUpload(files: File[]) => Promise<result>  called when user clicks Upload All
 *  - uploading: boolean
 *  - uploadProgress: number (0-100)
 *  - disabled: boolean
 */
const BatchUploader = ({ onUpload, uploading = false, uploadProgress = 0, disabled = false }) => {
  const [queue, setQueue] = useState([]); // { id, file, status: queued|uploading|done|error, error? }
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  let idCounter = useRef(0);

  const ACCEPTED_TYPES = [
    'application/pdf',
    'application/epub+zip',
    'application/epub'
  ];
  const ACCEPTED_EXTENSIONS = ['.pdf', '.epub'];
  const MAX_FILES = 20;

  const isAcceptedFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
  };

  const addFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).filter(isAcceptedFile);
    if (newFiles.length === 0) return;

    setQueue((prev) => {
      const remaining = MAX_FILES - prev.length;
      const toAdd = newFiles.slice(0, remaining).map((file) => ({
        id: `file-${Date.now()}-${++idCounter.current}`,
        file,
        status: 'queued',
        error: null
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const removeFromQueue = (id) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const handleUploadAll = async () => {
    if (!onUpload || queue.length === 0) return;

    const filesToUpload = queue.filter((q) => q.status === 'queued').map((q) => q.file);
    if (filesToUpload.length === 0) return;

    // Mark all queued as uploading
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'queued' ? { ...item, status: 'uploading' } : item
      )
    );

    try {
      const result = await onUpload(filesToUpload);
      // Mark all as done
      setQueue((prev) =>
        prev.map((item) =>
          item.status === 'uploading' ? { ...item, status: 'done' } : item
        )
      );
      return result;
    } catch (err) {
      // Mark as error
      setQueue((prev) =>
        prev.map((item) =>
          item.status === 'uploading'
            ? { ...item, status: 'error', error: err.message }
            : item
        )
      );
    }
  };

  const queuedCount = queue.filter((q) => q.status === 'queued').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;

  const getFileIcon = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'epub') return <BookOpen size={18} className="text-green-500" />;
    return <FileText size={18} className="text-blue-500" />;
  };

  const statusBadge = (item) => {
    switch (item.status) {
      case 'queued':
        return <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Queued</span>;
      case 'uploading':
        return (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Uploading
          </span>
        );
      case 'done':
        return (
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full flex items-center gap-1">
            <CheckCircle size={12} /> Done
          </span>
        );
      case 'error':
        return (
          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full flex items-center gap-1">
            <AlertCircle size={12} /> Error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-purple-500 bg-purple-50'
            : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.epub"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />
        <Upload size={36} className="mx-auto text-gray-400 mb-3" />
        <p className="text-gray-700 font-medium">
          Drag & drop files here, or click to browse
        </p>
        <p className="text-sm text-gray-500 mt-1">
          PDF and EPUB files accepted (up to {MAX_FILES} files)
        </p>
      </div>

      {/* Queue list */}
      {queue.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Queue header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              {queue.length} file{queue.length !== 1 ? 's' : ''} in queue
              {doneCount > 0 && ` (${doneCount} uploaded)`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearQueue}
                disabled={uploading}
                className="text-xs text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Overall progress */}
          {uploading && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* File items */}
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                {getFileIcon(item.file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                </div>
                {statusBadge(item)}
                {item.status === 'queued' && !uploading && (
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading || queue.length >= MAX_FILES}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
              Add More
            </button>
            <button
              onClick={handleUploadAll}
              disabled={uploading || queuedCount === 0 || disabled}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Upload All ({queuedCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchUploader;
