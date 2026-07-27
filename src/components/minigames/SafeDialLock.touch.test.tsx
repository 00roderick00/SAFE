/**
 * Tactile-redesign regression: the safe dial must be playable by DIRECT
 * touch manipulation — pressing on the dial and dragging in a circle
 * spins it, feeding the same step logic as the buttons/arrow keys.
 *
 * happy-dom's getBoundingClientRect returns a zero rect, so the dial
 * centre resolves to (0, 0); pointer coordinates are placed on a circle
 * around the origin and atan2 still yields the correct sweep angles.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafeDialLock } from './SafeDialLock';
import { createDialCode } from './verticalSliceConfig';

const DIAL_NUMBERS = 40;
const NOTCH_DEGREES = 360 / DIAL_NUMBERS; // 9°

afterEach(() => {
  vi.useRealTimers();
});

/** Pointer coordinates on a circle around the (0,0) dial centre. */
const point = (degrees: number, radius = 120) => ({
  clientX: Math.cos(degrees * (Math.PI / 180)) * radius,
  clientY: Math.sin(degrees * (Math.PI / 180)) * radius,
});

/**
 * One continuous circular drag gesture that sweeps `notches` notches.
 * Positive screen-angle sweep (y-down atan2) is clockwise. Each move
 * advances the pointer one notch plus a half-notch offset so float error
 * can never straddle the notch boundary.
 */
const dragNotches = (dial: Element, direction: 'cw' | 'ccw', notches: number) => {
  const sign = direction === 'cw' ? 1 : -1;
  fireEvent.pointerDown(dial, { pointerId: 1, ...point(0) });
  for (let i = 1; i <= notches; i++) {
    fireEvent.pointerMove(dial, { pointerId: 1, ...point(sign * (i * NOTCH_DEGREES + NOTCH_DEGREES / 2)) });
  }
  fireEvent.pointerUp(dial, { pointerId: 1, ...point(sign * (notches * NOTCH_DEGREES + NOTCH_DEGREES / 2)) });
};

describe('SafeDialLock touch controls', () => {
  it('enters the full seeded combination by circular drag alone', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const difficulty = 0.5;
    const code = createDialCode('dial-test', Math.floor(3 + difficulty));
    render(<SafeDialLock difficulty={difficulty} seed="dial-test" onComplete={onComplete} />);
    const dial = screen.getByRole('img', { name: /Safe dial at/ });
    let position = 0;
    for (const step of code) {
      const notches = step.direction === 'cw'
        ? (step.num - position + DIAL_NUMBERS) % DIAL_NUMBERS
        : (position - step.num + DIAL_NUMBERS) % DIAL_NUMBERS;
      expect(notches).toBeGreaterThan(0);
      dragNotches(dial, step.direction, notches);
      position = step.num;
    }
    act(() => { vi.advanceTimersByTime(300); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'safedial', moduleType: 'safedial', passed: true, score: 1 })
    );
  });

  it('ignores sub-notch wiggle and keeps the buttons as secondary controls', () => {
    render(<SafeDialLock difficulty={0.5} seed="dial-test" onComplete={vi.fn()} />);
    const dial = screen.getByRole('img', { name: /Safe dial at 0/ });
    fireEvent.pointerDown(dial, { pointerId: 1, ...point(0) });
    fireEvent.pointerMove(dial, { pointerId: 1, ...point(4) });
    fireEvent.pointerUp(dial, { pointerId: 1, ...point(4) });
    // Less than one notch of sweep must not turn the dial.
    expect(screen.getByRole('img', { name: /Safe dial at 0/ })).toBeInTheDocument();
    // The tap buttons remain for fine adjustment.
    expect(screen.getByRole('button', { name: 'Turn dial clockwise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn dial counterclockwise' })).toBeInTheDocument();
  });

  it('turns one notch per notch of sweep in either direction', () => {
    render(<SafeDialLock difficulty={0.5} seed="dial-test" onComplete={vi.fn()} />);
    const dial = screen.getByRole('img', { name: /Safe dial at/ });
    dragNotches(dial, 'cw', 3);
    expect(screen.getByRole('img', { name: /Safe dial at 3/ })).toBeInTheDocument();
    dragNotches(dial, 'ccw', 2);
    expect(screen.getByRole('img', { name: /Safe dial at 1/ })).toBeInTheDocument();
  });
});
