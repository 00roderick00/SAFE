/**
 * Regression tests for the three "skill, not chance" audit fixes:
 *
 * 1. ReactionGame — the game must always terminate (a round with no tap
 *    times out as a slow miss) and the end-of-game average must include
 *    the FINAL round (previously dropped by a stale closure).
 * 2. CombinationLock — wrong attempts yield per-digit higher/lower
 *    feedback so the seed-derived code is solvable by binary search, and
 *    the player's actual entered answer is submitted in onComplete.
 * 3. BreakoutGame — fixed-timestep loop: ball distance is a function of
 *    elapsed wall-clock time, not of how many rAF callbacks fired.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ReactionGame } from './ReactionGame';
import { CombinationLock } from './CombinationLock';
import { BreakoutGame } from './BreakoutGame';
import { deriveLockSolution } from '../../game/lockSolutions';
import type { MiniGameResult } from '../../types';

describe('ReactionGame skill fixes', () => {
  beforeEach(() => {
    // Fake Date too so reaction times are exactly the advanced ms.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    // Deterministic pre-"GO" delay: 1500 + 0 * 2000 = 1500ms.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('terminates with passed:false when the player never taps', () => {
    const onComplete = vi.fn<(result: MiniGameResult) => void>();
    render(<ReactionGame difficulty={0.5} onComplete={onComplete} />);

    // Never tap: every round should time out on its own and the game
    // must still end (previously it hung forever waiting for a tap).
    act(() => {
      vi.runAllTimers();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.passed).toBe(false);
    // All 4 rounds scored as 1500ms misses -> avg far over target -> 0.
    expect(result.score).toBe(0);
  });

  it('includes the final round in the average', () => {
    // difficulty 0.5 -> 4 rounds, targetTime 350ms.
    const onComplete = vi.fn<(result: MiniGameResult) => void>();
    render(<ReactionGame difficulty={0.5} onComplete={onComplete} />);
    const button = screen.getByRole('button');

    const playRound = (reactionMs: number) => {
      act(() => {
        vi.advanceTimersByTime(1500); // pre-GO delay elapses -> 'go'
      });
      act(() => {
        vi.advanceTimersByTime(reactionMs); // player "thinks" for this long
      });
      fireEvent.click(button);
      act(() => {
        vi.advanceTimersByTime(1500); // post-click pause -> next round / end
      });
    };

    playRound(200);
    playRound(200);
    playRound(200);
    playRound(1000); // final round is deliberately slow

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    // avg of [200, 200, 200, 1000] = 400 -> score 1 - (400-350)/500 = 0.9.
    // The old bug dropped the final round (avg 200 -> score 1).
    expect(result.score).toBeCloseTo(0.9, 5);
    expect(result.passed).toBe(true);
  });
});

describe('CombinationLock skill fixes', () => {
  const seed = 'skill-fixes-combo';
  const difficulty = 0.5;
  // Same seeded derivation the component (and the server) uses.
  const code = deriveLockSolution('combination', seed, difficulty);

  const enterCode = (digits: number[]) => {
    for (const digit of digits) {
      for (let i = 0; i < digit; i++) {
        fireEvent.click(screen.getByText('↻')); // dial starts at 0 each digit
      }
      fireEvent.click(screen.getByText('SET'));
    }
  };

  it('gives per-digit higher/lower feedback and accepts the real code', () => {
    const onComplete = vi.fn<(result: MiniGameResult) => void>();
    render(<CombinationLock difficulty={difficulty} seed={seed} onComplete={onComplete} />);

    // No feedback before any attempt.
    expect(screen.queryByTestId('combo-feedback')).toBeNull();

    // A deliberately wrong code: every digit off by one.
    const wrongGuess = code.map((d) => (d + 1) % 10);
    enterCode(wrongGuess);

    // Feedback appears, and since no digit matches, every position must
    // point higher or lower — the information needed for binary search.
    expect(screen.getByTestId('combo-feedback')).toBeInTheDocument();
    code.forEach((_, i) => {
      const symbol = screen.getByTestId(`combo-fb-${i}`).textContent;
      expect(['▲', '▼']).toContain(symbol);
    });

    // difficulty 0.5 -> maxAttempts = max(5, 8 - 1) = 7.
    expect(screen.getByText(`Attempts: 1/7`)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    // Enter the correct seed-derived code.
    enterCode(code);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    // The player's actual entered answer is what gets submitted (the
    // server verifies it against the same seed-derived secret).
    expect(result.answer).toEqual(code);
  });
});

describe('BreakoutGame fixed timestep', () => {
  let pending: Map<number, FrameRequestCallback>;
  let arcCalls: Array<{ x: number; y: number }>;
  let originalGetContext: PropertyDescriptor | undefined;

  const makeCtx = () => ({
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    roundRect: () => undefined,
    fill: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    // The ball is the only arc drawn — capture its position each frame.
    arc: (x: number, y: number) => {
      arcCalls.push({ x, y });
    },
  });

  beforeEach(() => {
    pending = new Map();
    arcCalls = [];
    let nextId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      ((cb: FrameRequestCallback) => {
        pending.set(nextId, cb);
        return nextId++;
      }) as typeof requestAnimationFrame
    );
    vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
      pending.delete(id);
    }) as typeof cancelAnimationFrame);

    originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: () => makeCtx(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalGetContext) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
    } else {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
    }
  });

  const flushFrame = (timestamp: number) => {
    const callbacks = [...pending.values()];
    pending.clear();
    act(() => {
      callbacks.forEach((cb) => cb(timestamp));
    });
  };

  /** Mounts a fresh game, starts it, drives the rAF loop with the given
   *  timestamps, and returns the first/last drawn ball positions. */
  const runFrames = (timestamps: number[]) => {
    arcCalls = [];
    const calls = arcCalls;
    const onComplete = vi.fn<(result: MiniGameResult) => void>();
    const { container, unmount } = render(<BreakoutGame difficulty={0.5} onComplete={onComplete} />);
    const canvas = container.querySelector('canvas')!;
    fireEvent.click(canvas); // start the game -> loop subscribes
    for (const ts of timestamps) flushFrame(ts);
    const first = calls[0];
    const last = calls[calls.length - 1];
    const text = container.textContent ?? '';
    const stillScheduled = pending.size > 0;
    unmount();
    pending.clear();
    return { first, last, text, stillScheduled, onComplete };
  };

  it('moves the ball by elapsed time, not by rAF callback count', () => {
    // Same 96ms of wall-clock time, delivered as 1 frame vs 2 frames.
    const oneBigFrame = runFrames([1000, 1096]);
    const twoSmallFrames = runFrames([1000, 1048, 1096]);
    // Only 48ms elapsed — must have covered less distance.
    const halfTheTime = runFrames([1000, 1048]);

    expect(oneBigFrame.first).toBeDefined();
    expect(oneBigFrame.last).toBeDefined();
    // The ball actually moved.
    expect(oneBigFrame.last).not.toEqual(oneBigFrame.first);
    // Equal elapsed time -> identical position regardless of frame count.
    expect(twoSmallFrames.last).toEqual(oneBigFrame.last);
    // Less elapsed time -> different (shorter) travel.
    expect(halfTheTime.last).not.toEqual(oneBigFrame.last);
  });

  it('keeps the rAF loop alive across brick hits', () => {
    // ~600ms of simulation is enough for the ball to reach the bricks.
    const run = runFrames([1000, 1200, 1400, 1600]);
    // At least one brick was hit (score counter left 0/16)...
    expect(run.text).toMatch(/[1-9]\d*\/16/);
    // ...and the game neither ended nor stalled mid-run: the loop was
    // still scheduled for the next frame after the brick-state change.
    expect(run.onComplete).not.toHaveBeenCalled();
    expect(run.stillScheduled).toBe(true);
  });
});
