/**
 * CostDisplay - Formats and color-codes monetary amounts
 * Props:
 *   amount (number) - The cost value
 *   size ('sm'|'md'|'lg') - Display size
 *   showSign (boolean) - Whether to show +/- sign
 */
function CostDisplay({ amount, size = 'md', showSign = false }) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    const dashSizes = {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-xl',
    };
    return <span className={`${dashSizes[size] || dashSizes.md} text-secondary-400`}>&mdash;</span>;
  }

  const absAmount = Math.abs(amount);

  // Color coding: green < $10, yellow $10-50, red > $50
  let colorClass;
  if (absAmount < 10) {
    colorClass = 'text-green-600';
  } else if (absAmount <= 50) {
    colorClass = 'text-yellow-600';
  } else {
    colorClass = 'text-red-600';
  }

  const sizeClasses = {
    sm: 'text-sm font-medium',
    md: 'text-base font-semibold',
    lg: 'text-xl font-bold',
  };

  const sign = showSign && amount > 0 ? '+' : '';
  const formatted = `${sign}$${absAmount.toFixed(2)}`;

  return (
    <span className={`${sizeClasses[size] || sizeClasses.md} ${colorClass}`}>
      {formatted}
    </span>
  );
}

export default CostDisplay;
