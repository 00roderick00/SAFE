// Odometer Component - Robinhood-style animated number display
// Numbers roll vertically like a slot machine when values change

import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OdometerProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Single digit that animates
const OdometerDigit = memo(({
  digit,
  duration
}: {
  digit: string;
  duration: number;
}) => {
  const isNumber = /\d/.test(digit);

  if (!isNumber) {
    // Static character (comma, period, etc.)
    return (
      <span className="inline-block">{digit}</span>
    );
  }

  const numericDigit = parseInt(digit, 10);

  return (
    <span className="inline-block relative overflow-hidden h-[1em]">
      <motion.span
        key={numericDigit}
        initial={{ y: '-100%' }}
        animate={{ y: '0%' }}
        exit={{ y: '100%' }}
        transition={{
          duration: duration,
          ease: [0.19, 1, 0.22, 1], // Expo out
        }}
        className="inline-block"
      >
        {digit}
      </motion.span>
    </span>
  );
});

OdometerDigit.displayName = 'OdometerDigit';

// Format number with commas and decimals
function formatNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

export const Odometer = memo(({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 0.5,
  className = '',
  size = 'lg',
}: OdometerProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [characters, setCharacters] = useState<string[]>([]);
  const prevValueRef = useRef(value);

  // Size classes
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl sm:text-5xl',
    xl: 'text-5xl sm:text-6xl',
  };

  useEffect(() => {
    // Animate from previous to new value
    const startValue = prevValueRef.current;
    const endValue = value;
    const diff = endValue - startValue;

    if (Math.abs(diff) < 0.01) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    // Animate over duration
    const steps = 20;
    const stepDuration = (duration * 1000) / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + diff * eased;

      setDisplayValue(currentValue);

      if (step >= steps) {
        clearInterval(interval);
        setDisplayValue(endValue);
        prevValueRef.current = endValue;
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [value, duration]);

  useEffect(() => {
    const formatted = formatNumber(displayValue, decimals);
    setCharacters(formatted.split(''));
  }, [displayValue, decimals]);

  return (
    <div className={`font-semibold tracking-tight ${sizeClasses[size]} ${className}`}>
      {prefix && <span>{prefix}</span>}
      <span className="inline-flex">
        <AnimatePresence mode="popLayout">
          {characters.map((char, index) => (
            <OdometerDigit
              key={`${index}-${char}`}
              digit={char}
              duration={duration * 0.3}
            />
          ))}
        </AnimatePresence>
      </span>
      {suffix && <span className="ml-1 text-[0.5em] text-text-dim">{suffix}</span>}
    </div>
  );
});

Odometer.displayName = 'Odometer';

// Simplified balance display with profit/loss indicator
interface BalanceDisplayProps {
  balance: number;
  previousBalance?: number;
  showChange?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const BalanceDisplay = memo(({
  balance,
  previousBalance,
  showChange = true,
  size = 'xl',
}: BalanceDisplayProps) => {
  const change = previousBalance !== undefined ? balance - previousBalance : 0;
  const changePercent = previousBalance && previousBalance > 0
    ? ((balance - previousBalance) / previousBalance) * 100
    : 0;
  const isProfit = change >= 0;

  return (
    <div className="text-center">
      <Odometer
        value={balance}
        prefix="$"
        decimals={2}
        size={size}
        className="text-text"
      />

      {showChange && previousBalance !== undefined && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-2 text-base font-medium ${
            isProfit ? 'text-profit' : 'text-loss'
          }`}
        >
          <span>{isProfit ? '+' : ''}</span>
          <span>${Math.abs(change).toFixed(2)}</span>
          <span className="mx-1">({isProfit ? '+' : ''}{changePercent.toFixed(1)}%)</span>
          <span className="text-text-dim">today</span>
        </motion.div>
      )}
    </div>
  );
});

BalanceDisplay.displayName = 'BalanceDisplay';

export default Odometer;
