import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';

function TextFilter({ filter, value, onChange }) {
  const [localValue, setLocalValue] = useState(value || '');
  const debounceRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setLocalValue(val);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChange(filter.key, val);
      }, 300);
    },
    [filter.key, onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400 pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={filter.label}
        className="w-full pl-8 pr-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-secondary-400 transition-shadow"
      />
    </div>
  );
}

function SelectFilter({ filter, value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(filter.key, e.target.value)}
      className="w-full px-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-secondary-700 transition-shadow appearance-none cursor-pointer"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        backgroundPosition: 'right 0.5rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1.5em 1.5em',
        paddingRight: '2.5rem',
      }}
    >
      <option value="">{filter.label}</option>
      {(filter.options || []).map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function DateRangeFilter({ filter, value, onChange }) {
  const from = value?.from || '';
  const to = value?.to || '';

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) =>
          onChange(filter.key, { ...value, from: e.target.value })
        }
        className="w-full px-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-secondary-700 transition-shadow"
        placeholder="From"
      />
      <span className="text-secondary-400 text-xs flex-shrink-0">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) =>
          onChange(filter.key, { ...value, to: e.target.value })
        }
        className="w-full px-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-secondary-700 transition-shadow"
        placeholder="To"
      />
    </div>
  );
}

function SizeRangeFilter({ filter, value, onChange }) {
  const min = value?.min || '';
  const max = value?.max || '';

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={min}
        onChange={(e) =>
          onChange(filter.key, { ...value, min: e.target.value })
        }
        placeholder="Min"
        min="0"
        className="w-full px-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-secondary-700 transition-shadow placeholder:text-secondary-400"
      />
      <span className="text-secondary-400 text-xs flex-shrink-0">-</span>
      <input
        type="number"
        value={max}
        onChange={(e) =>
          onChange(filter.key, { ...value, max: e.target.value })
        }
        placeholder="Max"
        min="0"
        className="w-full px-3 py-2 text-sm border border-secondary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-secondary-700 transition-shadow placeholder:text-secondary-400"
      />
    </div>
  );
}

function FilterBar({ filters = [], values = {}, onChange, onClear }) {
  const activeCount = useMemo(() => {
    return Object.entries(values).filter(([, val]) => {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'object') {
        return Object.values(val).some((v) => v !== '' && v !== null && v !== undefined);
      }
      return true;
    }).length;
  }, [values]);

  const renderFilter = (filter) => {
    const value = values[filter.key];

    switch (filter.type) {
      case 'text':
        return <TextFilter filter={filter} value={value} onChange={onChange} />;
      case 'select':
        return <SelectFilter filter={filter} value={value} onChange={onChange} />;
      case 'dateRange':
        return <DateRangeFilter filter={filter} value={value} onChange={onChange} />;
      case 'sizeRange':
        return <SizeRangeFilter filter={filter} value={value} onChange={onChange} />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-secondary-200 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter icon and label */}
        <div className="flex items-center gap-1.5 text-secondary-500 flex-shrink-0">
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-sm font-medium hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-primary-500 text-white rounded-full">
              {activeCount}
            </span>
          )}
        </div>

        {/* Filter controls */}
        {filters.map((filter) => (
          <div
            key={filter.key}
            className={`
              ${filter.type === 'dateRange' || filter.type === 'sizeRange' ? 'min-w-[240px]' : 'min-w-[160px]'}
              max-w-xs flex-shrink-0
            `}
          >
            {renderFilter(filter)}
          </div>
        ))}

        {/* Clear all button */}
        {activeCount > 0 && onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-secondary-500 hover:text-error-600 hover:bg-error-50 rounded-md transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
