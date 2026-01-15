import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  variant?: 'primary' | 'accent' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
}

const variantColors = {
  primary: {
    bg: 'bg-primary',
    glow: 'shadow-[0_0_10px_rgba(0,255,136,0.5)]',
  },
  accent: {
    bg: 'bg-accent',
    glow: 'shadow-[0_0_10px_rgba(255,0,255,0.5)]',
  },
  danger: {
    bg: 'bg-danger',
    glow: 'shadow-[0_0_10px_rgba(255,51,102,0.5)]',
  },
  warning: {
    bg: 'bg-warning',
    glow: 'shadow-[0_0_10px_rgba(255,170,0,0.5)]',
  },
};

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export const ProgressBar = ({
  value,
  max = 100,
  variant = 'primary',
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  className = '',
}: ProgressBarProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const colors = variantColors[variant];

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-text-dim">{label}</span>}
          {showLabel && (
            <span className="text-sm font-medium text-text">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`
          w-full rounded-full overflow-hidden
          bg-surface-light
          ${sizeStyles[size]}
        `}
      >
        <motion.div
          className={`
            h-full rounded-full
            ${colors.bg}
            ${colors.glow}
          `}
          initial={animated ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

// Circular progress variant
interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'primary' | 'accent' | 'danger' | 'warning';
  showValue?: boolean;
  label?: string;
  className?: string;
}

const variantStrokeColors = {
  primary: '#00ff88',
  accent: '#ff00ff',
  danger: '#ff3366',
  warning: '#ffaa00',
};

export const CircularProgress = ({
  value,
  max = 100,
  size = 80,
  strokeWidth = 6,
  variant = 'primary',
  showValue = true,
  label,
  className = '',
}: CircularProgressProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-light"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={variantStrokeColors[variant]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            filter: `drop-shadow(0 0 6px ${variantStrokeColors[variant]}80)`,
          }}
        />
      </svg>
      {(showValue || label) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showValue && (
            <span className="font-display font-bold text-lg text-text">
              {Math.round(percentage)}
            </span>
          )}
          {label && (
            <span className="text-xs text-text-dim">{label}</span>
          )}
        </div>
      )}
    </div>
  );
};
