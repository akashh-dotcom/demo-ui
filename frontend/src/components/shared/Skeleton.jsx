/**
 * Skeleton loading components for visual placeholders
 * Usage:
 *   <SkeletonText lines={3} />
 *   <SkeletonCard count={4} />
 *   <SkeletonTable rows={5} cols={4} />
 *   <SkeletonChart />
 */

function SkeletonLine({ width = '100%', height = 'h-4' }) {
  return (
    <div
      className={`${height} bg-secondary-200 dark:bg-secondary-700 rounded animate-pulse`}
      style={{ width }}
    />
  );
}

export function SkeletonText({ lines = 3 }) {
  const widths = ['100%', '90%', '75%', '85%', '60%'];
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

export function SkeletonCard({ count = 1 }) {
  return (
    <div className={`grid gap-4 ${count > 1 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6 animate-pulse border border-secondary-200 dark:border-secondary-700"
        >
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
            <div className="ml-4 flex-1">
              <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-20 mb-2" />
              <div className="h-6 bg-secondary-200 dark:bg-secondary-700 rounded w-24" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-full" />
            <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg overflow-hidden border border-secondary-200 dark:border-secondary-700 animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-6 py-4 bg-secondary-50 dark:bg-secondary-700/50 border-b border-secondary-200 dark:border-secondary-700">
        {Array.from({ length: cols }, (_, i) => (
          <div
            key={i}
            className="h-3 bg-secondary-200 dark:bg-secondary-600 rounded"
            style={{ width: `${100 / cols}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-4 px-6 py-4 border-b border-secondary-100 dark:border-secondary-700 last:border-b-0"
        >
          {Array.from({ length: cols }, (_, colIdx) => (
            <div
              key={colIdx}
              className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded"
              style={{ width: `${Math.random() * 30 + 40}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-lg p-6 animate-pulse border border-secondary-200 dark:border-secondary-700">
      <div className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded w-40 mb-6" />
      <div className="h-64 bg-secondary-100 dark:bg-secondary-700 rounded" />
    </div>
  );
}

/**
 * Generic Skeleton component with type selector
 */
export default function Skeleton({ type = 'text', lines, count, rows, cols }) {
  switch (type) {
    case 'card':
      return <SkeletonCard count={count} />;
    case 'table':
      return <SkeletonTable rows={rows} cols={cols} />;
    case 'chart':
      return <SkeletonChart />;
    case 'text':
    default:
      return <SkeletonText lines={lines} />;
  }
}
