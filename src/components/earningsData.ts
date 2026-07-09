// Data helpers for the EarningsGraph. Kept separate from the
// component file so that react-refresh treats the component file as
// components-only.

export interface DataPoint {
  timestamp: number;
  value: number;
}

export type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | 'ALL';

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
    const change = (Math.random() - 0.48) * volatility * value;
    value = Math.max(100, value + change);
    data.push({ timestamp, value });
  }

  return data;
}

export function filterDataByRange(data: DataPoint[], range: TimeRange): DataPoint[] {
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
