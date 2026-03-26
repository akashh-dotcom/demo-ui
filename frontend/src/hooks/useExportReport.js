import { useCallback } from 'react';
import * as XLSX from 'xlsx';

/**
 * Hook for exporting data to Excel (XLSX) and CSV formats.
 * Provides generic and specialized export functions for
 * DataTable data, conversion reports, cost analytics, and batch results.
 */
export default function useExportReport() {
  /**
   * Trigger a browser download from a Blob.
   */
  const downloadBlob = useCallback((blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Create a workbook, add sheets, and trigger download.
   */
  const downloadWorkbook = useCallback((wb, fileName) => {
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, fileName);
  }, [downloadBlob]);

  /**
   * Generic export: takes flat data + column definitions and writes XLSX.
   * columns: [{ key, label }]
   */
  const exportToExcel = useCallback((data, columns, fileName = 'export.xlsx') => {
    if (!data || data.length === 0) return;

    const headers = columns.map((c) => c.label || c.key);
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        return val !== undefined && val !== null ? val : '';
      })
    );

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    downloadWorkbook(wb, fileName);
  }, [downloadWorkbook]);

  /**
   * Generic CSV export from DataTable-style data.
   */
  const exportToCsv = useCallback((data, columns, fileName = 'export.csv') => {
    if (!data || data.length === 0) return;

    const headers = columns.map((c) => c.label || c.key);
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        const str = val !== undefined && val !== null ? String(val) : '';
        return `"${str.replace(/"/g, '""')}"`;
      })
    );

    const csv = [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, fileName);
  }, [downloadBlob]);

  /**
   * Multi-sheet conversion report export.
   * files: array of file/conversion records
   */
  const exportConversionReport = useCallback((files) => {
    if (!files || files.length === 0) return;

    const wb = XLSX.utils.book_new();
    const datestamp = new Date().toISOString().split('T')[0];

    // --- Sheet 1: Summary ---
    const summaryData = files.map((f) => ({
      'File Name': f.fileName || f.file_name || f.originalName || '',
      'Type': (f.fileType || f.file_type || '').toUpperCase(),
      'Status': f.status || '',
      'Publisher': f.publisher || f.conversionMetadata?.publisher || '',
      'Cost ($)': f.cost?.totalCost != null ? Number(f.cost.totalCost).toFixed(4) : (f.totalCost != null ? Number(f.totalCost).toFixed(4) : ''),
      'Duration (s)': f.processingDurationSeconds || f.totalDurationSeconds || '',
      'Quality Score': f.quality?.confidenceScore ?? f.confidenceScore ?? '',
      'Started': f.startedAt || f.createdAt || '',
      'Completed': f.completedAt || f.processingCompletedAt || '',
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // --- Sheet 2: Cost Breakdown ---
    const costData = files.map((f) => ({
      'File Name': f.fileName || f.file_name || f.originalName || '',
      'Model': f.cost?.model || f.model || '',
      'Input Tokens': f.cost?.inputTokens ?? '',
      'Output Tokens': f.cost?.outputTokens ?? '',
      'Cache Read Tokens': f.cost?.cacheReadTokens ?? '',
      'Cache Create Tokens': f.cost?.cacheCreateTokens ?? '',
      'Total Cost ($)': f.cost?.totalCost != null ? Number(f.cost.totalCost).toFixed(4) : '',
    }));
    const wsCost = XLSX.utils.json_to_sheet(costData);
    XLSX.utils.book_append_sheet(wb, wsCost, 'Cost Breakdown');

    // --- Sheet 3: Quality ---
    const qualityData = files.map((f) => ({
      'File Name': f.fileName || f.file_name || f.originalName || '',
      'Status': f.status || '',
      'Confidence Score': f.quality?.confidenceScore ?? '',
      'Validation Errors': f.quality?.validationErrors ?? '',
      'Validation Warnings': f.quality?.validationWarnings ?? '',
      'Error Message': f.errorMessage || '',
    }));
    const wsQuality = XLSX.utils.json_to_sheet(qualityData);
    XLSX.utils.book_append_sheet(wb, wsQuality, 'Quality');

    downloadWorkbook(wb, `conversion-report-${datestamp}.xlsx`);
  }, [downloadWorkbook]);

  /**
   * Multi-sheet cost analytics export.
   * analytics: { summary, daily, byModel, byPublisher, records }
   */
  const exportCostReport = useCallback((analytics) => {
    if (!analytics) return;

    const wb = XLSX.utils.book_new();
    const datestamp = new Date().toISOString().split('T')[0];

    // --- Sheet 1: Summary ---
    const summaryRows = [
      { Metric: 'Total Spend', Value: analytics.summary?.totalSpend != null ? `$${Number(analytics.summary.totalSpend).toFixed(2)}` : '' },
      { Metric: 'This Month', Value: analytics.summary?.thisMonth != null ? `$${Number(analytics.summary.thisMonth).toFixed(2)}` : '' },
      { Metric: 'Avg Per Book', Value: analytics.summary?.avgPerBook != null ? `$${Number(analytics.summary.avgPerBook).toFixed(2)}` : '' },
      { Metric: 'Most Expensive', Value: analytics.summary?.mostExpensive != null ? `$${Number(analytics.summary.mostExpensive).toFixed(2)}` : '' },
      { Metric: 'Cheapest', Value: analytics.summary?.cheapest != null ? `$${Number(analytics.summary.cheapest).toFixed(2)}` : '' },
      { Metric: 'Total Files', Value: analytics.records?.length ?? '' },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // --- Sheet 2: Daily ---
    if (analytics.daily && analytics.daily.length > 0) {
      const wsDaily = XLSX.utils.json_to_sheet(
        analytics.daily.map((d) => ({
          Date: d.date || '',
          'PDF Cost ($)': d.pdf != null ? Number(d.pdf).toFixed(4) : '0',
          'EPUB Cost ($)': d.epub != null ? Number(d.epub).toFixed(4) : '0',
          'Total ($)': ((d.pdf || 0) + (d.epub || 0)).toFixed(4),
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily');
    }

    // --- Sheet 3: By Model ---
    if (analytics.byModel && analytics.byModel.length > 0) {
      const wsModel = XLSX.utils.json_to_sheet(
        analytics.byModel.map((m) => ({
          Model: m.name || '',
          'Cost ($)': m.value != null ? Number(m.value).toFixed(4) : '0',
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsModel, 'By Model');
    }

    // --- Sheet 4: By Publisher ---
    if (analytics.byPublisher && analytics.byPublisher.length > 0) {
      const wsPublisher = XLSX.utils.json_to_sheet(
        analytics.byPublisher.map((p) => ({
          Publisher: p.name || '',
          'Cost ($)': p.value != null ? Number(p.value).toFixed(4) : '0',
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsPublisher, 'By Publisher');
    }

    downloadWorkbook(wb, `cost-report-${datestamp}.xlsx`);
  }, [downloadWorkbook]);

  /**
   * Export batch operation results.
   */
  const exportBatchReport = useCallback((batch) => {
    if (!batch) return;

    const wb = XLSX.utils.book_new();
    const datestamp = new Date().toISOString().split('T')[0];

    const batchFiles = (batch.files || []).map((f) => ({
      'File Name': f.fileName || f.originalName || '',
      'Status': f.status || '',
      'Error': f.errorMessage || '',
      'Created': f.createdAt || '',
      'Completed': f.processingCompletedAt || '',
    }));

    const ws = XLSX.utils.json_to_sheet(batchFiles);
    XLSX.utils.book_append_sheet(wb, ws, 'Batch Results');

    // Summary sheet
    const summaryData = [
      { Metric: 'Batch ID', Value: batch.batchId || '' },
      { Metric: 'Total Files', Value: batch.overall?.total ?? batchFiles.length },
      { Metric: 'Completed', Value: batch.overall?.completed ?? '' },
      { Metric: 'Failed', Value: batch.overall?.failed ?? '' },
      { Metric: 'Processing', Value: batch.overall?.processing ?? '' },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    downloadWorkbook(wb, `batch-report-${batch.batchId || datestamp}.xlsx`);
  }, [downloadWorkbook]);

  /**
   * Export QA report data to XLSX.
   */
  const exportQAReport = useCallback((qaData, fileName = '') => {
    if (!qaData) return;

    const wb = XLSX.utils.book_new();
    const datestamp = new Date().toISOString().split('T')[0];
    const safeName = (fileName || 'qa-report').replace(/[^a-zA-Z0-9_-]/g, '_');

    // --- Sheet 1: Overview ---
    const overview = [
      { Metric: 'Overall Quality Score', Value: qaData.qualityScore ?? 'N/A' },
      { Metric: 'Overall Confidence', Value: qaData.confidence?.overall ?? 'N/A' },
      { Metric: 'Validation Errors', Value: qaData.validationErrors ?? 0 },
      { Metric: 'Validation Warnings', Value: qaData.validationWarnings ?? 0 },
      { Metric: 'Total Issues', Value: qaData.issues?.length ?? 0 },
    ];
    const wsOverview = XLSX.utils.json_to_sheet(overview);
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');

    // --- Sheet 2: Page Confidence ---
    if (qaData.confidence?.pages && qaData.confidence.pages.length > 0) {
      const pageData = qaData.confidence.pages.map((p, i) => ({
        Page: p.page ?? i + 1,
        Confidence: p.confidence ?? p.score ?? '',
        Notes: p.notes || p.details || '',
      }));
      const wsPages = XLSX.utils.json_to_sheet(pageData);
      XLSX.utils.book_append_sheet(wb, wsPages, 'Page Confidence');
    }

    // --- Sheet 3: Issues ---
    if (qaData.issues && qaData.issues.length > 0) {
      const issueData = qaData.issues.map((iss) => ({
        Severity: iss.severity || '',
        Category: iss.category || iss.type || '',
        Message: iss.message || iss.description || '',
        Page: iss.page ?? '',
        Element: iss.element || '',
      }));
      const wsIssues = XLSX.utils.json_to_sheet(issueData);
      XLSX.utils.book_append_sheet(wb, wsIssues, 'Issues');
    }

    // --- Sheet 4: Preflight ---
    if (qaData.preflight && Object.keys(qaData.preflight).length > 0) {
      const preflightRows = Object.entries(qaData.preflight).map(([key, val]) => ({
        Check: key,
        Result: typeof val === 'object' ? JSON.stringify(val) : String(val),
      }));
      const wsPreflight = XLSX.utils.json_to_sheet(preflightRows);
      XLSX.utils.book_append_sheet(wb, wsPreflight, 'Preflight');
    }

    // --- Sheet 5: Post-processing ---
    if (qaData.postprocess && Object.keys(qaData.postprocess).length > 0) {
      const postRows = Array.isArray(qaData.postprocess.actions)
        ? qaData.postprocess.actions.map((a) => ({
            Action: a.action || a.name || '',
            Description: a.description || a.details || '',
            Result: a.result || a.status || '',
          }))
        : Object.entries(qaData.postprocess).map(([key, val]) => ({
            Key: key,
            Value: typeof val === 'object' ? JSON.stringify(val) : String(val),
          }));
      const wsPost = XLSX.utils.json_to_sheet(postRows);
      XLSX.utils.book_append_sheet(wb, wsPost, 'Post-processing');
    }

    downloadWorkbook(wb, `${safeName}-${datestamp}.xlsx`);
  }, [downloadWorkbook]);

  return {
    exportToExcel,
    exportToCsv,
    exportConversionReport,
    exportCostReport,
    exportBatchReport,
    exportQAReport,
  };
}
