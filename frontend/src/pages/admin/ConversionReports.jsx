import { useState, useEffect, useRef } from 'react';
import { getAllFiles, getExternalDashboard } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import Navigation from '../../components/shared/Navigation';
import Loading from '../../components/shared/Loading';
import * as XLSX from 'xlsx';

export const ConversionDashboard = () => {
  const { handleError, showSuccess } = useNotification();
  const [allFiles, setAllFiles] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [externalStats, setExternalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFileType, setSelectedFileType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Sorting state
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [openColumnMenu, setOpenColumnMenu] = useState(null);

  const menuRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, selectedFileType, selectedStatus, allFiles, sortColumn, sortDirection]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenColumnMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('Loading conversion data...');

      // Fetch all files from local database
      const [filesResponse, dashboardResponse] = await Promise.allSettled([
        getAllFiles(),
        getExternalDashboard()
      ]);

      if (filesResponse.status === 'fulfilled') {
        const files = filesResponse.value.data?.files || [];
        console.log(`Found ${files.length} files in database`);
        setAllFiles(files);
      }

      if (dashboardResponse.status === 'fulfilled') {
        setExternalStats(dashboardResponse.value.data);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      handleError(error, 'Failed to load conversion data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...allFiles];

    // Filter by file type
    if (selectedFileType !== 'all') {
      filtered = filtered.filter(file =>
        file.fileType?.toUpperCase() === selectedFileType
      );
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(file => file.status === selectedStatus);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(file => {
        return (
          file.originalName?.toLowerCase().includes(search) ||
          file.uploadedBy?.username?.toLowerCase().includes(search) ||
          file.uploadedBy?.email?.toLowerCase().includes(search) ||
          file.status?.toLowerCase().includes(search) ||
          file.conversionMetadata?.isbn?.includes(search)
        );
      });
    }

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal = getNestedValue(a, sortColumn);
        let bVal = getNestedValue(b, sortColumn);

        // Handle null/undefined values
        if (aVal === null || aVal === undefined || aVal === '') aVal = '';
        if (bVal === null || bVal === undefined || bVal === '') bVal = '';

        // Handle dates
        if (sortColumn.includes('At') || sortColumn === 'createdAt' || sortColumn === 'updatedAt') {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        }

        // Convert to comparable values
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        // Compare
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(filtered);
  };

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const handleSort = (column, direction) => {
    setSortColumn(column);
    setSortDirection(direction);
    setOpenColumnMenu(null);
    showSuccess(`Sorted by ${column} (${direction === 'asc' ? 'Oldest first' : 'Newest first'})`);
  };

  const clearSort = () => {
    setSortColumn('createdAt');
    setSortDirection('desc');
    setOpenColumnMenu(null);
    showSuccess('Sorting reset to default');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatProcessingTime = (file) => {
    if (!file.processingStartedAt || !file.processingCompletedAt) return 'N/A';
    const duration = (new Date(file.processingCompletedAt) - new Date(file.processingStartedAt)) / 1000;
    if (duration < 60) return `${duration.toFixed(1)}s`;
    if (duration < 3600) return `${(duration / 60).toFixed(1)}m`;
    return `${(duration / 3600).toFixed(1)}h`;
  };

  const exportToExcel = () => {
    if (filteredData.length === 0) {
      showSuccess('No data to export');
      return;
    }

    // Prepare data for export
    const exportData = filteredData.map(file => ({
      'File Name': file.originalName,
      'File Type': file.fileType?.toUpperCase(),
      'Status': getStatusLabel(file.status),
      'File Size': formatFileSize(file.fileSize),
      'Uploaded By': file.uploadedBy?.username || 'Unknown',
      'Upload Date': formatDate(file.createdAt),
      'Processing Time': formatProcessingTime(file),
      'ISBN': file.conversionMetadata?.isbn || 'N/A',
      'Output Files': file.outputFiles?.length || 0,
      'Error': file.errorMessage || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Conversions');

    const fileName = `conversion_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showSuccess(`Exported ${filteredData.length} rows to ${fileName}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFileType('all');
    setSelectedStatus('all');
    setSortColumn('createdAt');
    setSortDirection('desc');
  };

  const getStatusColor = (status) => {
    const colors = {
      'uploaded': 'bg-yellow-100 text-yellow-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'processing': 'bg-blue-100 text-blue-800',
      'ready_for_review': 'bg-purple-100 text-purple-800',
      'editing': 'bg-orange-100 text-orange-800',
      'finalizing': 'bg-indigo-100 text-indigo-800',
      'completed': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'uploaded': 'Uploaded',
      'pending': 'Pending',
      'processing': 'Processing',
      'ready_for_review': 'Ready for Review',
      'editing': 'Editing',
      'finalizing': 'Finalizing',
      'completed': 'Completed',
      'failed': 'Failed',
    };
    return labels[status] || status;
  };

  const getFileTypeBadgeColor = (fileType) => {
    const colors = {
      'EPUB': 'bg-purple-100 text-purple-800',
      'PDF': 'bg-red-100 text-red-800',
    };
    return colors[fileType?.toUpperCase()] || 'bg-gray-100 text-gray-800';
  };

  // Calculate stats
  const stats = {
    total: allFiles.length,
    completed: allFiles.filter(f => f.status === 'completed').length,
    processing: allFiles.filter(f => ['processing', 'pending', 'uploaded', 'finalizing'].includes(f.status)).length,
    failed: allFiles.filter(f => f.status === 'failed').length,
    pdf: allFiles.filter(f => f.fileType === 'pdf').length,
    epub: allFiles.filter(f => f.fileType === 'epub').length,
  };

  const statuses = ['uploaded', 'pending', 'processing', 'ready_for_review', 'editing', 'finalizing', 'completed', 'failed'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Conversion Reports
              </h1>
              <p className="text-gray-600">View and analyze all file conversions</p>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-20">
            <Loading />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-500">Total Files</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
                <div className="text-sm text-gray-500">Processing</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-sm text-gray-500">Failed</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-red-500">{stats.pdf}</div>
                <div className="text-sm text-gray-500">PDF Files</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-purple-600">{stats.epub}</div>
                <div className="text-sm text-gray-500">EPUB Files</div>
              </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, user, ISBN..."
                      className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* File Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    File Type
                  </label>
                  <select
                    value={selectedFileType}
                    onChange={(e) => setSelectedFileType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="PDF">PDF</option>
                    <option value="EPUB">EPUB</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="all">All Statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {getStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 items-end">
                  <button
                    onClick={clearFilters}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={exportToExcel}
                    disabled={filteredData.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export
                  </button>
                </div>
              </div>

              {/* Stats line */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <span>Showing <strong>{filteredData.length}</strong> of <strong>{allFiles.length}</strong> files</span>
                  {(searchTerm || selectedFileType !== 'all' || selectedStatus !== 'all') && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
                      Filters Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                {filteredData.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No Data Found</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {allFiles.length === 0
                        ? 'No files have been processed yet.'
                        : 'Try adjusting your filters.'}
                    </p>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-purple-600 to-blue-600 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          File Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Uploaded By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                          <button
                            onClick={() => handleSort('createdAt', sortDirection === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center gap-1 hover:text-purple-200"
                          >
                            Upload Date
                            {sortColumn === 'createdAt' && (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {sortDirection === 'asc' ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                )}
                              </svg>
                            )}
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Processing Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Outputs
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredData.map((file) => (
                        <tr key={file._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm">
                            <div className="font-medium text-gray-900 max-w-xs truncate" title={file.originalName}>
                              {file.originalName}
                            </div>
                            {file.conversionMetadata?.isbn && (
                              <div className="text-xs text-gray-500">
                                ISBN: {file.conversionMetadata.isbn}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFileTypeBadgeColor(file.fileType)}`}>
                              {file.fileType?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(file.status)}`}>
                              {getStatusLabel(file.status)}
                            </span>
                            {file.status === 'failed' && file.errorMessage && (
                              <div className="text-xs text-red-500 mt-1 max-w-xs truncate" title={file.errorMessage}>
                                {file.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatFileSize(file.fileSize)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {file.uploadedBy?.username || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(file.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatProcessingTime(file)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {file.outputFiles?.length || 0} file(s)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination Info */}
              {filteredData.length > 0 && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 text-center">
                    Showing {filteredData.length} of {allFiles.length} files
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ConversionDashboard;
