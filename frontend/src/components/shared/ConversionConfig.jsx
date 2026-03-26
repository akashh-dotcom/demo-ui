import { useState, useEffect } from 'react';
import {
  Sliders,
  RotateCcw,
  DollarSign,
  Cpu,
  Image,
  Thermometer,
  Layers,
  Settings,
  FileOutput
} from 'lucide-react';

const MODEL_COSTS = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, label: 'Claude Sonnet 4' },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0, label: 'Claude Opus 4' },
  'gpt-4': { input: 30.0, output: 60.0, label: 'GPT-4' },
  'gpt-4-turbo': { input: 10.0, output: 30.0, label: 'GPT-4 Turbo' }
};

const DEFAULTS = {
  model: 'claude-sonnet-4-20250514',
  dpi: '300',
  temperature: 0.3,
  batchSize: 5,
  processingMode: 'standard',
  templateType: 'docbook'
};

/**
 * Conversion configuration form.
 *
 * Props:
 *  - value: object with current config values
 *  - onChange(config): called when any field changes
 *  - compact: boolean for compact mode (embedded in modals)
 */
const ConversionConfig = ({ value = {}, onChange, compact = false }) => {
  const [config, setConfig] = useState({ ...DEFAULTS, ...value });

  useEffect(() => {
    setConfig((prev) => ({ ...prev, ...value }));
  }, [value]);

  const handleChange = (field, val) => {
    const updated = { ...config, [field]: val };
    setConfig(updated);
    onChange?.(updated);
  };

  const handleReset = () => {
    setConfig({ ...DEFAULTS });
    onChange?.({ ...DEFAULTS });
  };

  const modelInfo = MODEL_COSTS[config.model] || MODEL_COSTS[DEFAULTS.model];
  const estimatedCost = (modelInfo.input * 0.01 + modelInfo.output * 0.005).toFixed(4);

  const sectionClass = compact ? 'space-y-3' : 'space-y-4';
  const gridClass = compact ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4';

  return (
    <div className={sectionClass}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={20} className="text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Conversion Configuration</h3>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
        </div>
      )}

      <div className={gridClass}>
        {/* AI Model */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Cpu size={14} className="text-purple-500" />
            AI Model
          </label>
          <select
            value={config.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          >
            {Object.entries(MODEL_COSTS).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
        </div>

        {/* DPI */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Image size={14} className="text-blue-500" />
            DPI
          </label>
          <select
            value={config.dpi}
            onChange={(e) => handleChange('dpi', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          >
            <option value="150">150 DPI</option>
            <option value="200">200 DPI</option>
            <option value="300">300 DPI (Recommended)</option>
            <option value="600">600 DPI (High Quality)</option>
          </select>
        </div>

        {/* Temperature */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Thermometer size={14} className="text-orange-500" />
            Temperature
            <span className="text-gray-400 font-normal ml-1">{config.temperature}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.temperature}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Precise (0.0)</span>
            <span>Creative (1.0)</span>
          </div>
        </div>

        {/* Batch Size */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Layers size={14} className="text-green-500" />
            Batch Size
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={config.batchSize}
            onChange={(e) => handleChange('batchSize', Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Processing Mode */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Settings size={14} className="text-indigo-500" />
            Processing Mode
          </label>
          <select
            value={config.processingMode}
            onChange={(e) => handleChange('processingMode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          >
            <option value="standard">Standard</option>
            <option value="ocr">OCR</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        {/* Template Type */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <FileOutput size={14} className="text-teal-500" />
            Template Type
          </label>
          <select
            value={config.templateType}
            onChange={(e) => handleChange('templateType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          >
            <option value="docbook">DocBook</option>
            <option value="xml">XML</option>
            <option value="html">HTML</option>
          </select>
        </div>
      </div>

      {/* Estimated cost */}
      <div className={`flex items-center gap-2 ${compact ? 'p-2' : 'p-3'} bg-purple-50 border border-purple-100 rounded-lg`}>
        <DollarSign size={16} className="text-purple-600" />
        <div className="text-sm">
          <span className="text-purple-700 font-medium">Estimated cost per page:</span>{' '}
          <span className="text-purple-900 font-semibold">${estimatedCost}</span>
          <span className="text-purple-500 ml-2">
            ({modelInfo.label} - ${modelInfo.input}/M input, ${modelInfo.output}/M output)
          </span>
        </div>
      </div>

      {/* Compact reset */}
      {compact && (
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <RotateCcw size={12} />
          Reset to Defaults
        </button>
      )}
    </div>
  );
};

export default ConversionConfig;
