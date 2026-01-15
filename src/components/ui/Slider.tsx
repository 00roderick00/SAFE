import * as RadixSlider from '@radix-ui/react-slider';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  variant?: 'primary' | 'accent';
  disabled?: boolean;
  className?: string;
}

export const Slider = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  formatValue = (v) => `${Math.round(v * 100)}%`,
  variant = 'primary',
  disabled = false,
  className = '',
}: SliderProps) => {
  const colors = {
    primary: {
      track: 'bg-primary',
      thumb: 'bg-primary border-primary-dim',
      glow: 'shadow-[0_0_10px_rgba(0,255,136,0.5)]',
    },
    accent: {
      track: 'bg-accent',
      thumb: 'bg-accent border-accent-dim',
      glow: 'shadow-[0_0_10px_rgba(255,0,255,0.5)]',
    },
  };

  const colorScheme = colors[variant];

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <label className="text-sm font-medium text-text">{label}</label>
          )}
          {showValue && (
            <span className="text-sm font-display text-primary">
              {formatValue(value)}
            </span>
          )}
        </div>
      )}
      <RadixSlider.Root
        className={`
          relative flex items-center select-none touch-none
          w-full h-5
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        value={[value]}
        onValueChange={([newValue]) => onChange(newValue)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      >
        <RadixSlider.Track className="relative bg-surface-light h-2 grow rounded-full overflow-hidden">
          <RadixSlider.Range
            className={`
              absolute h-full rounded-full
              ${colorScheme.track}
              ${colorScheme.glow}
            `}
          />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className={`
            block w-5 h-5 rounded-full
            ${colorScheme.thumb}
            border-2
            ${colorScheme.glow}
            focus:outline-none focus:ring-2 focus:ring-primary/50
            transition-transform hover:scale-110
          `}
        />
      </RadixSlider.Root>
    </div>
  );
};

// Difficulty slider with labels
interface DifficultySliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export const DifficultySlider = ({
  value,
  onChange,
  disabled = false,
  className = '',
}: DifficultySliderProps) => {
  const getDifficultyLabel = (v: number): string => {
    if (v < 0.33) return 'Easy';
    if (v < 0.66) return 'Medium';
    return 'Hard';
  };

  const getDifficultyColor = (v: number): string => {
    if (v < 0.33) return 'text-primary';
    if (v < 0.66) return 'text-warning';
    return 'text-danger';
  };

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-text">Difficulty</label>
        <span className={`text-sm font-display ${getDifficultyColor(value)}`}>
          {getDifficultyLabel(value)}
        </span>
      </div>
      <Slider
        value={value}
        onChange={onChange}
        min={0}
        max={1}
        step={0.01}
        showValue={false}
        variant={value > 0.66 ? 'accent' : 'primary'}
        disabled={disabled}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-text-dim">Easy</span>
        <span className="text-xs text-text-dim">Hard</span>
      </div>
    </div>
  );
};
