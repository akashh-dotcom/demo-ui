import { useState, useEffect } from 'react';
import { getConversionRecords, getConversionStats } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import Loading from '../../components/shared/Loading';
import * as XLSX from 'xlsx';

export const ConversionDashboard = () => {
  const { handleError, showSuccess } = useNotification();
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFileType, setSelectedFileType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      loadRecords();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedFileType, selectedStatus, sortColumn, sortDirection]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadRecords(), loadStats()]);
    setLoading(false);
  };

  const loadRecords = async () => {
    try {
      const params = {
        limit: 200,
        offset: 0,
        sortBy: sortColumn,
        sortOrder: sortDirection
      };

      if (searchTerm) params.search = searchTerm;
      if (selectedFileType !== 'all') params.fileType = selectedFileType;
      if (selectedStatus !== 'all') params.status = selectedStatus;

      const response = await getConversionRecords(params);
      setRecords(response.data?.records || []);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Error loading records:', error);
      handleError(error, 'Failed to load conversion records');
    }
  };

  const loadStats = async () => {
    try {
      const response = await getConversionStats();
      setStats(response.data?.summary || null);
    } catch (error) {
      console.error('Error loading stats:', error);
      // Don't show error for stats - records are more important
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
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

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const exportToExcel = () => {
    if (records.length === 0) {
      showSuccess('No data to export');
      return;
    }

    const exportData = records.map(record => ({
      'File Name': record.fileName,
      'File Type': record.fileType?.toUpperCase(),
      'Status': getStatusLabel(record.status),
      'ISBN': record.isbn || 'N/A',
      'Title': record.title || 'N/A',
      'Author': record.author || 'N/A',
      'File Size': formatFileSize(record.fileSize),
      'Uploaded By': record.uploadedByUsername || 'Unknown',
      'Started At': formatDate(record.startedAt),
      'Completed At': formatDate(record.completedAt),
      'Processing Time': formatDuration(record.processingDurationSeconds),
      'Output Files': record.outputCount || 0,
      'Error': record.errorMessage || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Conversions');

    const fileName = `conversion_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showSuccess(`Exported ${records.length} records to ${fileName}`);
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
      'started': 'bg-yellow-100 text-yellow-800',
      'processing': 'bg-blue-100 text-blue-800',
      'ready_for_review': 'bg-purple-100 text-purple-800',
      'editing': 'bg-orange-100 text-orange-800',
      'completed': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'started': 'Started',
      'processing': 'Processing',
      'ready_for_review': 'Ready for Review',
      'editing': 'Editing',
      'completed': 'Completed',
      'failed': 'Failed',
    };
    return labels[status] || status;
  };

  const getFileTypeBadgeColor = (fileType) => {
    const colors = {
      'epub': 'bg-purple-100 text-purple-800',
      'pdf': 'bg-red-100 text-red-800',
    };
    return colors[fileType?.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const statuses = ['started', 'processing', 'ready_for_review', 'editing', 'completed', 'failed'];

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return null;
    return (
      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {sortDirection === 'asc' ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        )}
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Conversion Reports
              </h1>
              <p className="text-gray-600">Track and analyze all file conversions from MongoDB</p>
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
                <div className="text-2xl font-bold text-gray-900">{stats?.total || 0}</div>
                <div className="text-sm text-gray-500">Total Conversions</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-blue-600">{stats?.processing || 0}</div>
                <div className="text-sm text-gray-500">In Progress</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-red-600">{stats?.failed || 0}</div>
                <div className="text-sm text-gray-500">Failed</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-red-500">{stats?.pdfCount || 0}</div>
                <div className="text-sm text-gray-500">PDF Files</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4">
                <div className="text-2xl font-bold text-purple-600">{stats?.epubCount || 0}</div>
                <div className="text-sm text-gray-500">EPUB Files</div>
              </div>
            </div>

            {/* Additional Stats */}
            {stats && (stats.avgProcessingTime > 0 || stats.totalFileSize > 0) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="text-xl font-bold text-indigo-600">
                    {formatDuration(stats.avgProcessingTime)}
                  </div>
                  <div className="text-sm text-gray-500">Avg Processing Time</div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="text-xl font-bold text-indigo-600">
                    {formatDuration(stats.totalProcessingTime)}
                  </div>
                  <div className="text-sm text-gray-500">Total Processing Time</div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="text-xl font-bold text-indigo-600">
                    {formatFileSize(stats.totalFileSize)}
                  </div>
                  <div className="text-sm text-gray-500">Total Data Processed</div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="text-xl font-bold text-indigo-600">
                    {formatFileSize(stats.avgFileSize)}
                  </div>
                  <div className="text-sm text-gray-500">Avg File Size</div>
                </div>
              </div>
            )}

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
                      placeholder="Search by name, ISBN, title..."
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
                    <option value="pdf">PDF</option>
                    <option value="epub">EPUB</option>
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
                    disabled={records.length === 0}
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
                  <span>Showing <strong>{records.length}</strong> of <strong>{total}</strong> records</span>
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
                {records.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No Conversion Records</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {total === 0
                        ? 'No files have been processed yet. Conversion tracking starts when files are uploaded.'
                        : 'Try adjusting your filters.'}
                    </p>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-purple-600 to-blue-600 sticky top-0 z-10">
                      <tr>
                        <th
                          className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-purple-700"
                          onClick={() => handleSort('fileName')}
                        >
                          <div className="flex items-center">
                            File Name
                            <SortIcon column="fileName" />
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Type
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-purple-700"
                          onClick={() => handleSort('status')}
                        >
                          <div className="flex items-center">
                            Status
                            <SortIcon column="status" />
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          User
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-purple-700"
                          onClick={() => handleSort('startedAt')}
                        >
                          <div className="flex items-center">
                            Started
                            <SortIcon column="startedAt" />
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-purple-700"
                          onClick={() => handleSort('processingDurationSeconds')}
                        >
                          <div className="flex items-center">
                            Duration
                            <SortIcon column="processingDurationSeconds" />
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                          Outputs
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {records.map((record) => (
                        <tr key={record._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm">
                            <div className="font-medium text-gray-900 max-w-xs truncate" title={record.fileName}>
                              {record.fileName}
                            </div>
                            {record.isbn && (
                              <div className="text-xs text-gray-500">ISBN: {record.isbn}</div>
                            )}
                            {record.title && (
                              <div className="text-xs text-gray-400 truncate" title={record.title}>
                                {record.title}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFileTypeBadgeColor(record.fileType)}`}>
                              {record.fileType?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                              {getStatusLabel(record.status)}
                            </span>
                            {record.status === 'failed' && record.errorMessage && (
                              <div className="text-xs text-red-500 mt-1 max-w-xs truncate" title={record.errorMessage}>
                                {record.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatFileSize(record.fileSize)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {record.uploadedByUsername || record.uploadedBy?.username || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(record.startedAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDuration(record.processingDurationSeconds)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {record.outputCount || 0} file(s)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination Info */}
              {records.length > 0 && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 text-center">
                    Showing {records.length} of {total} conversion records
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
