import { Upload, Scan, RefreshCw, Package, CheckCircle2, Check } from 'lucide-react';

const STEPS = [
  { key: 'Uploading', label: 'Uploading', icon: Upload },
  { key: 'Extracting', label: 'Extracting', icon: Scan },
  { key: 'Converting', label: 'Converting', icon: RefreshCw },
  { key: 'Packaging', label: 'Packaging', icon: Package },
  { key: 'Validating', label: 'Validating', icon: CheckCircle2 },
  { key: 'Complete', label: 'Complete', icon: Check },
];

function getStepIndex(currentStep) {
  const idx = STEPS.findIndex((s) => s.key === currentStep);
  return idx >= 0 ? idx : 0;
}

/**
 * RealTimeProgress - Displays an animated step-based progress bar for file conversion.
 *
 * @param {string}  fileId       - The file ID (for keying, not displayed).
 * @param {string}  status       - Current conversion status (processing, completed, failed).
 * @param {number}  progress     - Overall progress percentage (0-100).
 * @param {string}  currentStep  - The active step key (e.g. "Extracting", "Converting").
 */
export default function RealTimeProgress({ fileId, status, progress = 0, currentStep = 'Uploading' }) {
  const activeIndex = status === 'completed' ? STEPS.length - 1 : getStepIndex(currentStep);
  const isFailed = status === 'failed';
  const isComplete = status === 'completed';

  return (
    <div className="w-full space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-secondary-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isFailed
                ? 'bg-error-500'
                : isComplete
                  ? 'bg-success-500'
                  : 'bg-primary-500 progress-bar-striped animate-progress-bar'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <span
          className={`text-sm font-semibold tabular-nums min-w-[3rem] text-right ${
            isFailed ? 'text-error-600' : isComplete ? 'text-success-600' : 'text-primary-600'
          }`}
        >
          {Math.round(progress)}%
        </span>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === activeIndex && !isFailed && !isComplete;
          const isCompleted = index < activeIndex || isComplete;
          const isPending = index > activeIndex;

          return (
            <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted
                    ? 'bg-success-500 text-white'
                    : isActive
                      ? 'bg-primary-500 text-white animate-status-pulse'
                      : isFailed && index === activeIndex
                        ? 'bg-error-500 text-white'
                        : 'bg-secondary-200 text-secondary-400'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'animate-pulse-glow' : ''}`} />
                )}
              </div>
              <span
                className={`text-xs font-medium text-center ${
                  isCompleted
                    ? 'text-success-600'
                    : isActive
                      ? 'text-primary-600 font-semibold'
                      : isFailed && index === activeIndex
                        ? 'text-error-600'
                        : 'text-secondary-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
