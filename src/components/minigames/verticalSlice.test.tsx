import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatternLock } from './PatternLock';
import { SafeDialLock } from './SafeDialLock';
import { TetrisGame } from './TetrisGame';
import { createDialCode, createSeededPattern } from './verticalSliceConfig';

afterEach(() => {
  vi.useRealTimers();
});

describe('Pattern Lock vertical slice', () => {
  it('supports accessible node controls and reports a seeded successful route', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const difficulty = .3;
    const gridSize = Math.round(3 + 2 * difficulty);
    const length = Math.min(gridSize * gridSize - 1, Math.round(4 + 5 * difficulty));
    const pattern = createSeededPattern('pattern-test', gridSize, length);
    render(<PatternLock difficulty={difficulty} seed="pattern-test" onComplete={onComplete} />);
    act(() => { vi.advanceTimersByTime(1_800); });
    for (const node of pattern) fireEvent.click(screen.getByRole('button', { name: `Pattern node ${node + 1}` }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ moduleType: 'pattern', passed: true }));
  });
});

describe('Tetris vertical slice', () => {
  it('exposes labeled touch controls and keyboard-compatible instructions', () => {
    const { unmount } = render(<TetrisGame difficulty={.5} seed="tetris-test" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move piece left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate piece clockwise' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('img', { name: /Tetris board/i })).toBeInTheDocument();
    expect(screen.getByText('Hard drop')).toBeInTheDocument();
    unmount();
  });

  it('plays a deterministic two-line board to a successful result', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<TetrisGame difficulty={0} seed="tetris-test" onComplete={onComplete} />);
    const left = screen.getByRole('button', { name: 'Move piece left' });
    const right = screen.getByRole('button', { name: 'Move piece right' });
    const rotate = screen.getByRole('button', { name: 'Rotate piece clockwise' });
    const drop = screen.getByRole('button', { name: 'Hard drop piece' });
    const place = (moves: number, direction: 'left' | 'right', rotations = 0) => {
      for (let turn = 0; turn < rotations; turn++) fireEvent.click(rotate);
      for (let move = 0; move < moves; move++) fireEvent.click(direction === 'left' ? left : right);
      fireEvent.click(drop);
    };

    // Seeded pieces: L, I, Z, Z, J, J, T. These placements complete
    // two rows while exercising lateral movement, rotation, and drop.
    place(4, 'left');
    place(0, 'left');
    place(4, 'left');
    place(2, 'left');
    place(3, 'right');
    place(1, 'right');
    place(4, 'right', 1);
    act(() => { vi.advanceTimersByTime(300); });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ moduleType: 'tetris', passed: true, score: 1 }));
  });
});

describe('Safe Dial vertical slice', () => {
  it('accepts the deterministic combination through labeled controls', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const difficulty = .5;
    const code = createDialCode('dial-test', Math.floor(3 + difficulty));
    render(<SafeDialLock difficulty={difficulty} seed="dial-test" onComplete={onComplete} />);
    let position = 0;
    for (const step of code) {
      const moves = step.direction === 'cw' ? (step.num - position + 40) % 40 : (position - step.num + 40) % 40;
      const button = screen.getByRole('button', { name: step.direction === 'cw' ? 'Turn dial clockwise' : 'Turn dial counterclockwise' });
      for (let move = 0; move < moves; move++) fireEvent.click(button);
      position = step.num;
    }
    act(() => { vi.advanceTimersByTime(300); });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ moduleType: 'safedial', passed: true }));
  });
});
