import { createRng } from '@shared/rng.ts';

export function createSeededPattern(seed: string, gridSize: number, length: number): number[] {
  const rng = createRng(seed);
  const total = gridSize * gridSize;
  const pattern: number[] = [];
  const used = new Set<number>();
  let current = Math.floor(rng() * total);
  pattern.push(current);
  used.add(current);
  while (pattern.length < length) {
    const row = Math.floor(current / gridSize);
    const column = current % gridSize;
    const neighbors: number[] = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        const next = nextRow * gridSize + nextColumn;
        if (nextRow >= 0 && nextRow < gridSize && nextColumn >= 0 && nextColumn < gridSize && !used.has(next)) neighbors.push(next);
      }
    }
    const available = neighbors.length ? neighbors : Array.from({ length: total }, (_, index) => index).filter((index) => !used.has(index));
    if (!available.length) break;
    current = available[Math.floor(rng() * available.length)];
    pattern.push(current);
    used.add(current);
  }
  return pattern;
}

export type DialDirection = 'cw' | 'ccw';
export interface DialStep { num: number; direction: DialDirection; }

export function createDialCode(seed: string, steps: number, dialNumbers = 40): DialStep[] {
  const rng = createRng(seed);
  const code: DialStep[] = [];
  let previous = 0;
  for (let index = 0; index < steps; index++) {
    let number = 0;
    do number = Math.floor(rng() * dialNumbers); while (Math.abs(number - previous) < 5);
    code.push({ num: number, direction: index % 2 === 0 ? 'cw' : 'ccw' });
    previous = number;
  }
  return code;
}

