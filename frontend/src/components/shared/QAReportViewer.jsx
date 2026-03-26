import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Shield,
  FileSearch,
  Wrench,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import Modal from './Modal';
import { getQAReport } from '../../utils/api';
import useExportReport from '../../hooks/useExportReport';

function getScoreColor(score) {
  if (score == null) return '#9ca3af';
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#f59e0b';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

function getScoreLabel(score) {
  if (score == null) return 'N/A';
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
}

function getSeverityIcon(severity) {
  const s = (severity || '').toUpperCase();
  if (s === 'HIGH' || s === 'ERROR') return <AlertCircle className="w-4 h-4 text-red-500" />;
  if (s === 'MEDIUM' || s === 'WARNING') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <Info className="w-4 h-4 text-blue-500" />;
}

function getSeverityBadge(severity) {
  const s = (severity || '').toUpperCase();
  if (s === 'HIGH' || s === 'ERROR')
    return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'MEDIUM' || s === 'WARNING')
    return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-blue-100 text-blue-800 border-blue-200';
}

/** Circular gauge for the quality score */
function QualityGauge({ score }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const offset = circumference - (pct / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth="10"
        />
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="70" y="65" textAnchor="middle" fontSize="28" fontWeight="bold" fill={color}>
          {score != null ? Math.round(score) : '--'}
        </text>
        <text x="70" y="85" textAnchor="middle" fontSize="12" fill="#6b7280">
          {getScoreLabel(score)}
        </text>
      </svg>
    </div>
  );
}

/** Collapsible issue group */
function IssueGroup({ severity, issues }) {
  const [expanded, setExpanded] = useState(severity === 'HIGH');

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {getSeverityIcon(severity)}
          <span className="font-medium text-sm text-gray-900">
            {severity || 'INFO'} ({issues.length})
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="divide-y divide-gray-100">
          {issues.map((issue, idx) => (
            <div key={idx} className="px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSeverityBadge(severity)}`}>
                  {severity}
                </span>
                <span className="text-gray-800">{issue.message || issue.description || 'Unknown issue'}</span>
              </div>
              {(issue.page || issue.element || issue.category) && (
                <div className="mt-1 ml-14 text-xs text-gray-500 flex gap-3">
                  {issue.page && <span>Page: {issue.page}</span>}
                  {issue.element && <span>Element: {issue.element}</span>}
                  {issue.category && <span>Category: {issue.category}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QAReportViewer({ fileId, fileName, isOpen, onClose }) {
  const [qaData, setQaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { exportQAReport } = useExportReport();

  const fetchQA = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getQAReport(fileId);
      setQaData(result.data || result);
    } catch (err) {
      setError(err.message || 'Failed to load QA report');
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen && fileId) {
      fetchQA();
    }
  }, [isOpen, fileId, fetchQA]);

  const handleExport = () => {
    if (qaData) {
      exportQAReport(qaData, fileName || `file-${fileId}`);
    }
  };

  // Group issues by severity
  const groupedIssues = {};
  if (qaData?.issues) {
    for (const issue of qaData.issues) {
      const sev = (issue.severity || 'LOW').toUpperCase();
      if (!groupedIssues[sev]) groupedIssues[sev] = [];
      groupedIssues[sev].push(issue);
    }
  }
  const severityOrder = ['HIGH', 'ERROR', 'MEDIUM', 'WARNING', 'LOW', 'INFO'];

  // Page confidence chart data
  const pageChartData = (qaData?.confidence?.pages || []).map((p, i) => ({
    page: `P${p.page ?? i + 1}`,
    confidence: p.confidence ?? p.score ?? 0,
  }));

  const footer = (
    <>
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        Close
      </button>
      {qaData && (
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: '#4f7299' }}
        >
          <Download className="w-4 h-4" />
          Export QA Report
        </button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="QA Report" size="xl" footer={footer}>
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-gray-500 text-sm">Loading QA report...</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium text-sm">{error}</p>
          <button onClick={fetchQA} className="mt-2 text-sm text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {qaData && !loading && (
        <div className="space-y-6">
          {/* Overall Score */}
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-xl">
            <QualityGauge score={qaData.qualityScore} />
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Overall Quality</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-gray-500 text-xs">Validation Errors</p>
                  <p className="text-lg font-bold text-red-600">{qaData.validationErrors ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-gray-500 text-xs">Validation Warnings</p>
                  <p className="text-lg font-bold text-amber-600">{qaData.validationWarnings ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-gray-500 text-xs">Total Issues</p>
                  <p className="text-lg font-bold text-gray-800">{qaData.issues?.length ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-gray-500 text-xs">Confidence</p>
                  <p className="text-lg font-bold" style={{ color: getScoreColor(qaData.confidence?.overall) }}>
                    {qaData.confidence?.overall != null ? `${Math.round(qaData.confidence.overall)}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Page Confidence Chart */}
          {pageChartData.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: '#4f7299' }} />
                Confidence Per Page
              </h3>
              <div className="bg-white rounded-lg border p-4">
                <ResponsiveContainer width="100%" height={Math.max(200, Math.min(pageChartData.length * 30, 400))}>
                  <BarChart data={pageChartData} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="page" width={40} style={{ fontSize: '11px' }} />
                    <Tooltip formatter={(val) => `${val}%`} />
                    <Bar dataKey="confidence" radius={[0, 4, 4, 0]}>
                      {pageChartData.map((entry, idx) => (
                        <Cell key={idx} fill={getScoreColor(entry.confidence)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Issues */}
          {qaData.issues && qaData.issues.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: '#f59e0b' }} />
                Issues ({qaData.issues.length})
              </h3>
              <div className="space-y-2">
                {severityOrder
                  .filter((sev) => groupedIssues[sev] && groupedIssues[sev].length > 0)
                  .map((sev) => (
                    <IssueGroup key={sev} severity={sev} issues={groupedIssues[sev]} />
                  ))}
              </div>
            </div>
          )}

          {/* No issues found */}
          {(!qaData.issues || qaData.issues.length === 0) && (
            <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-green-700 font-medium text-sm">No issues found</p>
            </div>
          )}

          {/* Preflight Findings */}
          {qaData.preflight && Object.keys(qaData.preflight).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileSearch className="w-4 h-4" style={{ color: '#6890b8' }} />
                Pre-flight Findings
              </h3>
              <div className="bg-white rounded-lg border p-4 text-sm">
                <dl className="space-y-2">
                  {Object.entries(qaData.preflight)
                    .filter(([k]) => k !== 'issues' && k !== 'errors' && k !== 'warnings')
                    .slice(0, 20)
                    .map(([key, val]) => (
                      <div key={key} className="flex gap-3">
                        <dt className="font-medium text-gray-600 min-w-[140px]">{key}</dt>
                        <dd className="text-gray-800">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          )}

          {/* Post-processing Actions */}
          {qaData.postprocess && Object.keys(qaData.postprocess).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                Post-processing Actions
              </h3>
              <div className="bg-white rounded-lg border p-4 text-sm">
                {Array.isArray(qaData.postprocess.actions) ? (
                  <ul className="space-y-2">
                    {qaData.postprocess.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-800">
                          {a.action || a.name}: {a.description || a.details || a.result || ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="space-y-2">
                    {Object.entries(qaData.postprocess)
                      .filter(([k]) => k !== 'issues' && k !== 'errors' && k !== 'warnings')
                      .slice(0, 20)
                      .map(([key, val]) => (
                        <div key={key} className="flex gap-3">
                          <dt className="font-medium text-gray-600 min-w-[140px]">{key}</dt>
                          <dd className="text-gray-800">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No data state */}
      {!qaData && !loading && !error && (
        <div className="text-center py-12">
          <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No QA data available for this file</p>
        </div>
      )}
    </Modal>
  );
}
