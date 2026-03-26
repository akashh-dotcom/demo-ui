import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import useCostAnalytics from '../hooks/useCostAnalytics';
import useExportReport from '../hooks/useExportReport';
import DataTable from '../components/shared/DataTable';
import FilterBar from '../components/shared/FilterBar';
import CostDisplay from '../components/shared/CostDisplay';

const RANGE_OPTIONS = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

const PIE_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];
const BAR_COLORS = ['#6890b8', '#4f7299', '#3d5b7a', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  return `$${Number(val).toFixed(2)}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Skeleton card loader
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6 animate-pulse">
      <div className="flex items-center">
        <div className="w-12 h-12 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
        <div className="ml-4 flex-1">
          <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-20 mb-2" />
          <div className="h-6 bg-secondary-200 dark:bg-secondary-700 rounded w-24" />
        </div>
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6 animate-pulse">
      <div className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded w-40 mb-6" />
      <div className="h-64 bg-secondary-100 dark:bg-secondary-700 rounded" />
    </div>
  );
}

// Custom tooltip for area/bar charts
function CostTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-secondary-700 px-4 py-3 border-2 rounded-lg shadow-xl border-primary-500">
      <p className="text-sm font-semibold text-secondary-900 dark:text-secondary-100">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

function CostAnalytics() {
  const { summary, analytics, loading, error, fetchAll, fetchAnalytics } = useCostAnalytics();
  const { exportCostReport } = useExportReport();
  const [range, setRange] = useState('30d');
  const [filters, setFilters] = useState({});
  const [tablePage, setTablePage] = useState(1);
  const hasLoadedRef = useRef(false);
  const tablePageSize = 15;

  // Initial load
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      const days = RANGE_OPTIONS.find(r => r.key === range)?.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      fetchAll({
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      });
    }
  }, []);

  // Handle range toggle
  const handleRangeChange = useCallback((newRange) => {
    setRange(newRange);
    const days = RANGE_OPTIONS.find(r => r.key === newRange)?.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    fetchAll({
      ...filters,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });
  }, [fetchAll, filters]);

  // Handle filter changes
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      // Flatten date range
      if (key === 'dateRange' && value) {
        if (value.from) next.startDate = value.from;
        else delete next.startDate;
        if (value.to) next.endDate = value.to;
        else delete next.endDate;
      }
      return next;
    });
    setTablePage(1);
  }, []);

  const handleFilterClear = useCallback(() => {
    setFilters({});
    setTablePage(1);
    const days = RANGE_OPTIONS.find(r => r.key === range)?.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    fetchAll({
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });
  }, [fetchAll, range]);

  // Apply filters
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const params = { ...filters };
    // Ensure date range from range picker if not overridden
    if (!params.startDate) {
      const days = RANGE_OPTIONS.find(r => r.key === range)?.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      params.startDate = startDate.toISOString().split('T')[0];
    }
    if (!params.endDate) {
      params.endDate = new Date().toISOString().split('T')[0];
    }
    // Clean up dateRange object before sending
    delete params.dateRange;
    fetchAnalytics(params);
  }, [filters]);

  // Summary cards data
  const summaryCards = [
    {
      label: 'Total Spend',
      value: summary?.totalSpend,
      icon: <DollarSign className="w-6 h-6 text-white" />,
      color: '#6890b8',
    },
    {
      label: 'This Month',
      value: summary?.thisMonth,
      icon: <Calendar className="w-6 h-6 text-white" />,
      color: '#4f7299',
    },
    {
      label: 'Avg Per Book',
      value: summary?.avgPerBook,
      icon: <BarChart3 className="w-6 h-6 text-white" />,
      color: '#3d5b7a',
    },
    {
      label: 'Most Expensive',
      value: summary?.mostExpensive,
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      color: '#ef4444',
    },
    {
      label: 'Cheapest',
      value: summary?.cheapest,
      icon: <TrendingDown className="w-6 h-6 text-white" />,
      color: '#10b981',
    },
  ];

  // Chart data
  const dailyCostData = analytics?.daily || [];
  const costByTypeData = analytics?.byType || [];
  const costByModelData = analytics?.byModel || [];
  const costByPublisherData = (analytics?.byPublisher || []).slice(0, 10);
  const records = analytics?.records || [];

  // Paginated table data
  const paginatedRecords = records.slice(
    (tablePage - 1) * tablePageSize,
    tablePage * tablePageSize
  );
  const totalTablePages = Math.ceil(records.length / tablePageSize);

  // Table columns
  const tableColumns = [
    {
      key: 'fileName',
      label: 'File Name',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-secondary-900 truncate max-w-[200px] block">
          {row.fileName || row.file_name || 'Unnamed'}
        </span>
      ),
    },
    {
      key: 'fileType',
      label: 'Type',
      render: (row) => (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 uppercase">
          {row.fileType || row.file_type || '—'}
        </span>
      ),
    },
    {
      key: 'publisher',
      label: 'Publisher',
      render: (row) => row.publisher || '—',
    },
    {
      key: 'model',
      label: 'Model',
      render: (row) => (
        <span className="text-xs font-mono">{row.model || '—'}</span>
      ),
    },
    {
      key: 'pages',
      label: 'Pages',
      render: (row) => row.pages ?? '—',
    },
    {
      key: 'tokens',
      label: 'Tokens',
      render: (row) => row.tokens != null ? row.tokens.toLocaleString() : '—',
    },
    {
      key: 'cost',
      label: 'Cost',
      sortable: true,
      render: (row) => <CostDisplay amount={row.cost} size="sm" />,
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (row) => formatDateFull(row.date || row.createdAt || row.created_at),
    },
  ];

  // Filter config for FilterBar
  const filterConfigs = [
    {
      key: 'dateRange',
      type: 'dateRange',
      label: 'Date Range',
    },
    {
      key: 'fileType',
      type: 'select',
      label: 'File Type',
      options: [
        { value: 'pdf', label: 'PDF' },
        { value: 'epub', label: 'EPUB' },
      ],
    },
    {
      key: 'publisher',
      type: 'text',
      label: 'Publisher',
    },
    {
      key: 'model',
      type: 'text',
      label: 'Model',
    },
  ];

  // Export CSV
  const handleExport = useCallback(() => {
    if (!records.length) return;
    const headers = ['File Name', 'Type', 'Publisher', 'Model', 'Pages', 'Tokens', 'Cost', 'Date'];
    const rows = records.map(r => [
      r.fileName || r.file_name || '',
      r.fileType || r.file_type || '',
      r.publisher || '',
      r.model || '',
      r.pages ?? '',
      r.tokens ?? '',
      r.cost != null ? r.cost.toFixed(2) : '',
      r.date || r.createdAt || r.created_at || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [records]);

  // Empty state
  const hasData = summary && (summary.totalSpend > 0 || records.length > 0);

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-secondary-900 dark:text-secondary-100">
              Cost Analytics
            </h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-primary-500 dark:text-primary-400">
              Track conversion costs, analyze spending patterns, and optimize your budget
            </p>
          </div>
          {summary && records.length > 0 && (
            <button
              onClick={() => exportCostReport({ summary, daily: dailyCostData, byModel: costByModelData, byPublisher: costByPublisherData, records })}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium text-sm shadow-md hover:shadow-lg transition-all self-start sm:self-center"
              style={{ backgroundColor: '#4f7299' }}
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && !summary && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-6">
              {Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2"><SkeletonChart /></div>
              <SkeletonChart />
            </div>
          </>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 mb-6 text-center">
            <p className="text-red-700 dark:text-red-400 font-medium">Failed to load cost data</p>
            <p className="text-red-500 dark:text-red-400/80 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !hasData && summary !== null && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-primary-500" />
            </div>
            <h2 className="text-2xl font-semibold text-secondary-900 dark:text-secondary-100 mb-2">
              No conversion data yet
            </h2>
            <p className="text-secondary-500 dark:text-secondary-400 max-w-md">
              Cost analytics will appear here once you start converting manuscripts.
            </p>
          </div>
        )}

        {/* Main content */}
        {!loading || summary ? (
          <>
            {/* Row 1: Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow"
                  style={{ borderLeft: `4px solid ${card.color}` }}
                >
                  <div className="flex items-center">
                    <div
                      className="flex-shrink-0 rounded-lg p-2 sm:p-3"
                      style={{ backgroundColor: card.color }}
                    >
                      {card.icon}
                    </div>
                    <div className="ml-3 sm:ml-4">
                      <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-secondary-400">{card.label}</p>
                      <p className="text-lg sm:text-2xl font-bold text-secondary-900 dark:text-secondary-100">
                        {formatCurrency(card.value)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Row 2: Cost Over Time + Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 sm:mb-8">
              {/* Area Chart */}
              <div className="lg:col-span-2 bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg sm:text-xl font-bold flex items-center text-secondary-900 dark:text-secondary-100">
                    <span className="rounded-lg p-2 mr-3" style={{ backgroundColor: '#e8f3f9' }}>
                      <TrendingUp className="w-5 h-5" style={{ color: '#6890b8' }} />
                    </span>
                    Cost Over Time
                  </h2>
                  <div className="flex gap-1">
                    {RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => handleRangeChange(opt.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          range === opt.key
                            ? 'bg-blue-600 text-white'
                            : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {dailyCostData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dailyCostData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="costPdfGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="costEpubGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        tickFormatter={formatDateShort}
                      />
                      <YAxis
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip content={<CostTooltip />} />
                      <Legend iconType="rect" />
                      <Area
                        type="monotone"
                        dataKey="pdf"
                        stackId="1"
                        stroke="#3b82f6"
                        fill="url(#costPdfGrad)"
                        name="PDF"
                      />
                      <Area
                        type="monotone"
                        dataKey="epub"
                        stackId="1"
                        stroke="#14b8a6"
                        fill="url(#costEpubGrad)"
                        name="EPUB"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    <p className="text-sm">No daily cost data available</p>
                  </div>
                )}
              </div>

              {/* Pie Chart */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6">
                <h2 className="text-lg sm:text-xl font-bold flex items-center mb-6 text-secondary-900 dark:text-secondary-100">
                  <span className="rounded-lg p-2 mr-3 bg-primary-50 dark:bg-primary-900/30">
                    <PieChartIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </span>
                  Cost By Type
                </h2>
                {costByTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={costByTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={90}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {costByTypeData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatCurrency(val)} />
                      <Legend verticalAlign="bottom" iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    <p className="text-sm">No type breakdown available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Cost By Model + Cost By Publisher */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
              {/* By Model */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6">
                <h2 className="text-lg sm:text-xl font-bold flex items-center mb-6 text-secondary-900 dark:text-secondary-100">
                  <span className="rounded-lg p-2 mr-3 bg-primary-50 dark:bg-primary-900/30">
                    <BarChart3 className="w-5 h-5 text-primary-500" />
                  </span>
                  Cost By Model
                </h2>
                {costByModelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costByModelData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip content={<CostTooltip />} />
                      <Bar dataKey="value" name="Cost" radius={[4, 4, 0, 0]}>
                        {costByModelData.map((_, idx) => (
                          <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    <p className="text-sm">No model cost data available</p>
                  </div>
                )}
              </div>

              {/* By Publisher */}
              <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6">
                <h2 className="text-lg sm:text-xl font-bold flex items-center mb-6 text-secondary-900 dark:text-secondary-100">
                  <span className="rounded-lg p-2 mr-3 bg-primary-50 dark:bg-primary-900/30">
                    <BarChart3 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </span>
                  Cost By Publisher (Top 10)
                </h2>
                {costByPublisherData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costByPublisherData} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        type="number"
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#6b7280"
                        style={{ fontSize: '11px' }}
                        width={70}
                      />
                      <Tooltip content={<CostTooltip />} />
                      <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]}>
                        {costByPublisherData.map((_, idx) => (
                          <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    <p className="text-sm">No publisher cost data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Detailed Table */}
            <div className="space-y-4">
              <FilterBar
                filters={filterConfigs}
                values={filters}
                onChange={handleFilterChange}
                onClear={handleFilterClear}
              />
              <DataTable
                columns={tableColumns}
                data={paginatedRecords}
                loading={loading}
                emptyMessage="No conversion data yet"
                onExport={records.length > 0 ? handleExport : undefined}
                pagination={
                  records.length > 0
                    ? {
                        page: tablePage,
                        totalPages: totalTablePages,
                        totalItems: records.length,
                        limit: tablePageSize,
                      }
                    : undefined
                }
                onPageChange={setTablePage}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default CostAnalytics;
