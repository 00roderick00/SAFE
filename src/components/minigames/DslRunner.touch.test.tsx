/**
 * Tactile-redesign regression: DslRunner must be fully playable by touch
 * with DIRECT manipulation — tap the destination cell to walk toward it,
 * swipe on the board for a single step. No D-pad. The recorded input
 * trace must still describe the run tick-by-tick so the server replay
 * verification (phase 3b) keeps working.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DslRunner } from './DslRunner';

const CELL = 24;
const TICK_MS = 200; // 5 Hz

const corridorGame = (width: number) => ({
  version: 1,
  board: { width, height: 1 },
  entities: [
    { id: 'p', kind: 'player', x: 0, y: 0, movement: { type: 'input' } },
    { id: 'g', kind: 'goal', x: width - 1, y: 0 },
  ],
  timeLimit: 30,
  winCondition: 'reach_goal',
});

afterEach(() => {
  vi.useRealTimers();
});

const tapAt = (el: Element, x: number, y: number) => {
  fireEvent.pointerDown(el, { clientX: x, clientY: y });
  fireEvent.pointerUp(el, { clientX: x, clientY: y });
};

describe('DslRunner touch controls', () => {
  it('walks to a tapped destination cell and wins, recording the trace', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <DslRunner difficulty={0.5} seed="touch-tap" config={corridorGame(5)} onComplete={onComplete} />
    );
    const board = screen.getByRole('application');
    // Tap the centre of the goal cell (4, 0).
    tapAt(board, 4 * CELL + CELL / 2, CELL / 2);
    act(() => { vi.advanceTimersByTime(TICK_MS * 5); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.passed).toBe(true);
    expect(result.moduleType).toBe('custom');
    // Four steps reach the goal; the server replay (replayDslTrace) stops
    // at the win, so a trailing same-batch tick entry is harmless.
    expect(result.inputTrace.slice(0, 4)).toEqual(['right', 'right', 'right', 'right']);
    expect(result.inputTrace.every((d: string) => d === 'right')).toBe(true);
  });

  it('steps once per swipe in the swiped direction', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <DslRunner difficulty={0.5} seed="touch-swipe" config={corridorGame(3)} onComplete={onComplete} />
    );
    const board = screen.getByRole('application');
    const swipeRight = () => {
      fireEvent.pointerDown(board, { clientX: 10, clientY: 10 });
      fireEvent.pointerUp(board, { clientX: 70, clientY: 10 });
    };
    swipeRight();
    act(() => { vi.advanceTimersByTime(TICK_MS); });
    // One swipe = one step: the run is not over after a single step.
    expect(onComplete).not.toHaveBeenCalled();
    swipeRight();
    act(() => { vi.advanceTimersByTime(TICK_MS); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.passed).toBe(true);
    expect(result.inputTrace).toEqual(['right', 'right']);
  });

  it('keeps keyboard as a secondary control scheme', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <DslRunner difficulty={0.5} seed="touch-kbd" config={corridorGame(2)} onComplete={onComplete} />
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    act(() => { vi.advanceTimersByTime(TICK_MS); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].passed).toBe(true);
  });

  it('renders no D-pad buttons', () => {
    render(
      <DslRunner difficulty={0.5} seed="touch-nodpad" config={corridorGame(3)} onComplete={vi.fn()} />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
