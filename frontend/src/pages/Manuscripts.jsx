import { useState, useEffect } from 'react';
import { useManuscripts } from '../hooks/useManuscripts';
import { useDownload } from '../hooks/useDownload';
import { useNotification } from '../contexts/NotificationContext';
import Navigation from '../components/shared/Navigation';
import Loading from '../components/shared/Loading';
import FileUpload from '../components/shared/FileUpload';
import ConfirmationDialog from '../components/shared/ConfirmationDialog';

export const Manuscripts = () => {
  const { manuscripts, loading, getManuscripts, uploadManuscript, deleteManuscript, getDownloadUrl } = useManuscripts();
  const { downloadFile } = useDownload();
  const { showSuccess, showError, handleError } = useNotification();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadManuscripts();
    const interval = setInterval(loadManuscripts, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadManuscripts = async () => {
    try {
      await getManuscripts();
    } catch (error) {
      handleError(error, 'Failed to load manuscripts');
    }
  };

  const handleFileSelect = async (file) => {
    setUploading(true);
    try {
      await uploadManuscript(file);
      showSuccess('Upload Successful', `${file.name} has been uploaded successfully`);
      setShowUploadModal(false);
    } catch (error) {
      handleError(error, 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (manuscript, fileType) => {
    try {
      const urlData = await getDownloadUrl(manuscript.id, fileType);
      await downloadFile(urlData.download_url, `${manuscript.file_name}.${fileType}`);
      showSuccess('Download Started', `Downloading ${fileType} file`);
    } catch (error) {
      handleError(error, 'Download failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteManuscript(deleteConfirm.id);
      showSuccess('Deleted', `${deleteConfirm.file_name} has been deleted`);
      setDeleteConfirm(null);
    } catch (error) {
      handleError(error, 'Delete failed');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      complete: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredManuscripts = manuscripts.filter((m) => {
    const matchesSearch = m.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Manuscripts</h1>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Upload Manuscript
          </button>
        </div>

        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <input
                type="text"
                placeholder="Search manuscripts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="complete">Complete</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <Loading />
          ) : filteredManuscripts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No manuscripts found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredManuscripts.map((manuscript) => (
                    <tr key={manuscript.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {manuscript.file_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(manuscript.status)}`}
                        >
                          {manuscript.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(manuscript.upload_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        {manuscript.status === 'complete' && (
                          <>
                            <button
                              onClick={() => handleDownload(manuscript, 'docx')}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              DOCX
                            </button>
                            <button
                              onClick={() => handleDownload(manuscript, 'xml')}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              XML
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(manuscript)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => !uploading && setShowUploadModal(false)}
            ></div>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Upload Manuscript
              </h3>
              {uploading ? (
                <Loading text="Uploading..." />
              ) : (
                <>
                  <FileUpload onFileSelect={handleFileSelect} accept=".pdf" maxSize={10485760} />
                  <div className="mt-5 sm:mt-6">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(false)}
                      className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete Manuscript"
        message={`Are you sure you want to delete "${deleteConfirm?.file_name}"? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
};

export default Manuscripts;
