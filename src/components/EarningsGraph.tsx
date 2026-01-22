// Earnings Graph Component - Robinhood-style interactive line chart
// Features: No axes, gradient fill, scrubbing interaction, time range pills

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { motion } from 'framer-motion';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface EarningsGraphProps {
  data: DataPoint[];
  height?: number;
  onScrub?: (point: DataPoint | null) => void;
  className?: string;
}

type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | 'ALL';

// Generate sample data for demo purposes
export function generateSampleData(
  days: number,
  startValue: number = 1000,
  volatility: number = 0.05
): DataPoint[] {
  const data: DataPoint[] = [];
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  let value = startValue;

  for (let i = days; i >= 0; i--) {
    const timestamp = now - i * msPerDay;
    // Random walk with slight upward bias
    const change = (Math.random() - 0.48) * volatility * value;
    value = Math.max(100, value + change);
    data.push({ timestamp, value });
  }

  return data;
}

// SVG path from data points
function dataToPath(
  data: DataPoint[],
  width: number,
  height: number,
  padding: number = 0
): string {
  if (data.length < 2) return '';

  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));
  const valueRange = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = padding + (1 - (point.value - minValue) / valueRange) * (height - padding * 2);
    return { x, y };
  });

  // Create smooth path
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    path += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return path;
}

// Create gradient fill area path
function dataToAreaPath(
  data: DataPoint[],
  width: number,
  height: number,
  padding: number = 0
): string {
  const linePath = dataToPath(data, width, height, padding);
  if (!linePath) return '';

  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export const EarningsGraph = memo(({
  data,
  height = 200,
  onScrub,
  className = '',
}: EarningsGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const [scrubPoint, setScrubPoint] = useState<DataPoint | null>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height });

  // Determine if overall trend is profit or loss
  const isProfit = data.length >= 2 && data[data.length - 1].value >= data[0].value;
  const colorClass = isProfit ? 'profit' : 'loss';

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

  // Handle scrubbing
  const handleScrubMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current || data.length === 0) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, dimensions.width));
      const index = Math.round((x / dimensions.width) * (data.length - 1));
      const point = data[Math.max(0, Math.min(index, data.length - 1))];

      setScrubX(x);
      setScrubPoint(point);
      onScrub?.(point);
    },
    [data, dimensions.width, onScrub]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setScrubbing(true);
      handleScrubMove(e.touches[0].clientX);
    },
    [handleScrubMove]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (scrubbing) {
        handleScrubMove(e.touches[0].clientX);
      }
    },
    [scrubbing, handleScrubMove]
  );

  const handleTouchEnd = useCallback(() => {
    setScrubbing(false);
    setScrubX(null);
    setScrubPoint(null);
    onScrub?.(null);
  }, [onScrub]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setScrubbing(true);
      handleScrubMove(e.clientX);
    },
    [handleScrubMove]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (scrubbing) {
        handleScrubMove(e.clientX);
      }
    },
    [scrubbing, handleScrubMove]
  );

  const handleMouseUp = useCallback(() => {
    setScrubbing(false);
    setScrubX(null);
    setScrubPoint(null);
    onScrub?.(null);
  }, [onScrub]);

  const handleMouseLeave = useCallback(() => {
    if (scrubbing) {
      setScrubbing(false);
      setScrubX(null);
      setScrubPoint(null);
      onScrub?.(null);
    }
  }, [scrubbing, onScrub]);

  const linePath = dataToPath(data, dimensions.width, dimensions.height, 10);
  const areaPath = dataToAreaPath(data, dimensions.width, dimensions.height, 10);

  return (
    <div
      ref={containerRef}
      className={`relative touch-none select-none ${className}`}
      style={{ height }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={`gradient-${colorClass}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              className={colorClass === 'profit' ? 'text-profit' : 'text-loss'}
              style={{ stopColor: 'currentColor', stopOpacity: 0.3 }}
            />
            <stop
              offset="100%"
              className={colorClass === 'profit' ? 'text-profit' : 'text-loss'}
              style={{ stopColor: 'currentColor', stopOpacity: 0 }}
            />
          </linearGradient>
        </defs>

        {/* Gradient fill */}
        <motion.path
          d={areaPath}
          fill={`url(#gradient-${colorClass})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Line */}
        <motion.path
          d={linePath}
          className={`graph-line ${colorClass}`}
          strokeWidth={2}
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />

        {/* Scrub dot */}
        {scrubbing && scrubX !== null && scrubPoint && (
          <circle
            cx={scrubX}
            cy={
              10 +
              (1 -
                (scrubPoint.value - Math.min(...data.map((d) => d.value))) /
                  (Math.max(...data.map((d) => d.value)) -
                    Math.min(...data.map((d) => d.value)) || 1)) *
                (dimensions.height - 20)
            }
            r={6}
            className={colorClass === 'profit' ? 'fill-profit' : 'fill-loss'}
          />
        )}
      </svg>

      {/* Scrub line */}
      {scrubbing && scrubX !== null && (
        <div
          className="absolute top-0 bottom-0 w-[1px] bg-text-dim pointer-events-none"
          style={{ left: scrubX }}
        />
      )}

      {/* Scrub tooltip */}
      {scrubbing && scrubX !== null && scrubPoint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-0 bg-surface-elevated px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
          style={{
            left: Math.max(40, Math.min(scrubX, dimensions.width - 80)),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-sm font-semibold">
            ${scrubPoint.value.toFixed(2)}
          </div>
          <div className="text-xs text-text-dim">
            {new Date(scrubPoint.timestamp).toLocaleDateString()}
          </div>
        </motion.div>
      )}
    </div>
  );
});

EarningsGraph.displayName = 'EarningsGraph';

// Time range selector pills
interface TimeRangePillsProps {
  selected: TimeRange;
  onChange: (range: TimeRange) => void;
}

export const TimeRangePills = memo(({ selected, onChange }: TimeRangePillsProps) => {
  const ranges: TimeRange[] = ['1D', '1W', '1M', '3M', 'YTD', 'ALL'];

  return (
    <div className="time-pills">
      {ranges.map((range) => (
        <button
          key={range}
          className={`time-pill ${selected === range ? 'active' : ''}`}
          onClick={() => onChange(range)}
        >
          {range}
        </button>
      ))}
    </div>
  );
});

TimeRangePills.displayName = 'TimeRangePills';

// Get data filtered by time range
export function filterDataByRange(
  data: DataPoint[],
  range: TimeRange
): DataPoint[] {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  let cutoff: number;
  switch (range) {
    case '1D':
      cutoff = now - msPerDay;
      break;
    case '1W':
      cutoff = now - 7 * msPerDay;
      break;
    case '1M':
      cutoff = now - 30 * msPerDay;
      break;
    case '3M':
      cutoff = now - 90 * msPerDay;
      break;
    case 'YTD':
      cutoff = new Date(new Date().getFullYear(), 0, 1).getTime();
      break;
    case 'ALL':
    default:
      return data;
  }

  return data.filter((d) => d.timestamp >= cutoff);
}

export default EarningsGraph;
