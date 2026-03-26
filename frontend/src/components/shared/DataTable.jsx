import { useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
} from 'lucide-react';

function SkeletonRow({ colCount }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: colCount }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-secondary-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function DataTable({
  columns = [],
  data = [],
  loading = false,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  sortBy,
  sortOrder = 'asc',
  onSort,
  pagination,
  onPageChange,
  emptyMessage = 'No data found',
  onExport,
  actions,
}) {
  const totalColumns =
    columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0);

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    const allIds = data.map((row) => row.id || row._id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allIds));
    }
  }, [data, selectedIds, onSelectionChange]);

  const handleSelectRow = useCallback(
    (rowId) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const handleSort = useCallback(
    (key) => {
      if (onSort) onSort(key);
    },
    [onSort]
  );

  const allSelected =
    data.length > 0 &&
    data.every((row) => selectedIds.has(row.id || row._id));
  const someSelected =
    data.some((row) => selectedIds.has(row.id || row._id)) && !allSelected;

  // Pagination helpers
  const renderPageNumbers = () => {
    if (!pagination) return null;
    const { page, totalPages } = pagination;
    const pages = [];
    const maxVisible = 5;

    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(
        <button
          key={1}
          onClick={() => onPageChange(1)}
          className="px-3 py-1.5 text-sm rounded-md text-secondary-600 hover:bg-secondary-100 transition-colors"
        >
          1
        </button>
      );
      if (start > 2) {
        pages.push(
          <span key="start-ellipsis" className="px-1 text-secondary-400">
            ...
          </span>
        );
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => onPageChange(i)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            i === page
              ? 'bg-primary-500 text-white font-medium'
              : 'text-secondary-600 hover:bg-secondary-100'
          }`}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push(
          <span key="end-ellipsis" className="px-1 text-secondary-400">
            ...
          </span>
        );
      }
      pages.push(
        <button
          key={totalPages}
          onClick={() => onPageChange(totalPages)}
          className="px-3 py-1.5 text-sm rounded-md text-secondary-600 hover:bg-secondary-100 transition-colors"
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  return (
    <div className="bg-white rounded-lg border border-secondary-200 shadow-sm overflow-hidden">
      {/* Export button */}
      {onExport && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-secondary-100">
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100 rounded-md transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary-50 border-b border-secondary-200">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-secondary-300 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-secondary-500 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-secondary-700' : ''
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {col.sortable && (
                      <span className="inline-flex flex-col ml-0.5">
                        {sortBy === col.key ? (
                          sortOrder === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-primary-500" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-primary-500" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 text-secondary-300" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-secondary-500">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-100">
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <SkeletonRow key={i} colCount={totalColumns} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center text-secondary-400">
                    <Inbox className="w-12 h-12 mb-3 stroke-1" />
                    <p className="text-sm font-medium">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const rowId = row.id || row._id;
                const isSelected = selectedIds.has(rowId);

                return (
                  <tr
                    key={rowId || rowIndex}
                    className={`
                      transition-colors duration-100
                      ${isSelected ? 'bg-primary-50' : 'hover:bg-secondary-50'}
                    `}
                  >
                    {selectable && (
                      <td className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(rowId)}
                          className="w-4 h-4 rounded border-secondary-300 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-sm text-secondary-700">
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3 text-right text-sm">
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-secondary-200 bg-secondary-50">
          <div className="text-sm text-secondary-500">
            Showing{' '}
            <span className="font-medium text-secondary-700">
              {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.totalItems)}
            </span>
            {' - '}
            <span className="font-medium text-secondary-700">
              {Math.min(pagination.page * pagination.limit, pagination.totalItems)}
            </span>{' '}
            of{' '}
            <span className="font-medium text-secondary-700">
              {pagination.totalItems}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-md text-secondary-500 hover:bg-secondary-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {renderPageNumbers()}
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-md text-secondary-500 hover:bg-secondary-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
