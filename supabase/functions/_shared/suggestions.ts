// Turns a calibration miss into a concrete, creator-facing "try this"
// nudge. TESTING-FINDINGS P2.3: creators had no feedback loop — 5 of 6
// DSL prompts were rejected with only "too hard/easy". This maps the
// reason + the actual config/program to a specific lever to move.

import type { DslGame } from './dsl.ts';

export type CalibrationReason = 'too_easy' | 'too_hard' | 'unsupported_engine' | undefined;

export interface SuggestInputEngine {
  mode: 'engine_config';
  engine: string;
  config: Record<string, unknown>;
  reason: CalibrationReason;
}

export interface SuggestInputDsl {
  mode: 'dsl_program';
  dsl: DslGame;
  reason: CalibrationReason;
}

export type SuggestInput = SuggestInputEngine | SuggestInputDsl;

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Bump `s` seconds onto a time value, phrased as "+Ns". */
const plusSeconds = (current: number, delta: number): string =>
  `increase the timer to ~${Math.round(current + delta)}s (+${delta}s)`;

const minusSeconds = (current: number, delta: number): string =>
  `cut the timer to ~${Math.max(1, Math.round(current - delta))}s (-${delta}s)`;

// Per-engine primary lever. `harder`/`easier` return the phrasing for
// pushing solve-rate down/up respectively.
const ENGINE_LEVERS: Record<
  string,
  (cfg: Record<string, unknown>) => { harder: string; easier: string }
> = {
  maze: (c) => ({
    easier: `${plusSeconds(num(c.timeLimit, 30), 8)} or shrink the grid by 1`,
    harder: `${minusSeconds(num(c.timeLimit, 30), 8)} or grow the grid by 1`,
  }),
  snake: (c) => ({
    easier: `${plusSeconds(num(c.timeLimit, 45), 10)} or lower the target length by 2`,
    harder: `raise the target length by 2 or speed the snake up by 1`,
  }),
  timing: (c) => ({
    easier: `widen the target zone (+8°) or allow one more attempt`,
    harder: `narrow the target zone (-8°) or drop an attempt (now ${num(c.attemptsAllowed, 3)})`,
  }),
  pattern: (c) => ({
    easier: `shorten the pattern by 1 or add memorize time (+500ms)`,
    harder: `lengthen the pattern by 1 (now ${num(c.requiredLength, 6)}) or cut memorize time`,
  }),
  memorymatch: (c) => ({
    easier: `remove a pair (now ${num(c.pairCount, 8)}) or add memorize time`,
    harder: `add a pair or cut memorize time`,
  }),
  quickmath: (c) => ({
    easier: `${plusSeconds(num(c.timeLimit, 45), 10)} or ask fewer problems`,
    harder: `ask more problems (now ${num(c.problemCount, 10)}) or shorten the timer`,
  }),
};

function suggestEngine(input: SuggestInputEngine): string | undefined {
  const lever = ENGINE_LEVERS[input.engine];
  if (!lever) return undefined;
  const { harder, easier } = lever(input.config);
  if (input.reason === 'too_hard') return `Too hard — ${easier}.`;
  if (input.reason === 'too_easy') return `Too easy — ${harder}.`;
  return undefined;
}

function suggestDsl(input: SuggestInputDsl): string | undefined {
  const g = input.dsl;
  const enemies = g.entities.filter((e) => e.kind === 'enemy');
  const time = g.timeLimit;

  if (input.reason === 'too_hard') {
    const parts: string[] = [plusSeconds(time, 8)];
    if (enemies.length > 0) {
      parts.push(`remove one enemy (now ${enemies.length})`);
      const fastest = Math.max(...enemies.map((e) => (e.movement && 'speed' in e.movement ? e.movement.speed : 1)));
      if (fastest > 1) parts.push('slow the enemies down by 1');
    }
    return `Too hard — ${parts.join(', or ')}.`;
  }
  if (input.reason === 'too_easy') {
    const parts: string[] = [];
    if (enemies.length === 0) parts.push('add a chasing enemy');
    else parts.push(`add another enemy (now ${enemies.length}), or speed them up by 1`);
    parts.push(minusSeconds(time, 8));
    return `Too easy — ${parts.join(', or ')}.`;
  }
  return undefined;
}

/** Concrete difficulty tweak for a rejected game, or undefined. */
export function suggestTweak(input: SuggestInput): string | undefined {
  return input.mode === 'engine_config' ? suggestEngine(input) : suggestDsl(input);
}
