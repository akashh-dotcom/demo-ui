const statusConfig = {
  uploaded: {
    bg: 'bg-secondary-100',
    text: 'text-secondary-700',
    dot: 'bg-secondary-400',
    ring: 'ring-secondary-400/20',
  },
  pending: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    dot: 'bg-warning-500',
    ring: 'ring-warning-500/20',
  },
  processing: {
    bg: 'bg-primary-50',
    text: 'text-primary-700',
    dot: 'bg-primary-500',
    ring: 'ring-primary-500/20',
    pulse: true,
  },
  editing: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    ring: 'ring-orange-500/20',
  },
  completed: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    dot: 'bg-success-500',
    ring: 'ring-success-500/20',
  },
  failed: {
    bg: 'bg-error-50',
    text: 'text-error-700',
    dot: 'bg-error-500',
    ring: 'ring-error-500/20',
  },
  cancelled: {
    bg: 'bg-secondary-100',
    text: 'text-secondary-500',
    dot: 'bg-secondary-400',
    ring: 'ring-secondary-400/20',
  },
};

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    dot: 'w-1.5 h-1.5 mr-1',
  },
  md: {
    badge: 'px-2.5 py-1 text-xs',
    dot: 'w-2 h-2 mr-1.5',
  },
  lg: {
    badge: 'px-3 py-1.5 text-sm',
    dot: 'w-2.5 h-2.5 mr-2',
  },
};

function StatusBadge({ status, size = 'md' }) {
  const normalizedStatus = (status || '').toLowerCase().trim();
  const config = statusConfig[normalizedStatus] || statusConfig.uploaded;
  const sizeStyles = sizeConfig[size] || sizeConfig.md;

  const displayLabel =
    normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium ring-1 ring-inset
        ${config.bg} ${config.text} ${config.ring} ${sizeStyles.badge}
      `}
    >
      <span
        className={`
          inline-block rounded-full flex-shrink-0
          ${config.dot} ${sizeStyles.dot}
          ${config.pulse ? 'animate-pulse' : ''}
        `}
      />
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
