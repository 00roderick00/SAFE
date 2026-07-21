import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameThumbnail } from './GameThumbnail';
import { getGameMotif } from '../../game/catalog';

describe('game thumbnail motifs (Section 6)', () => {
  it('maps each mechanic family to its motif', () => {
    expect(getGameMotif('timing')).toBe('dial');
    expect(getGameMotif('safedial')).toBe('dial');
    expect(getGameMotif('tetris')).toBe('stack');
    expect(getGameMotif('spaceinvaders')).toBe('burst');
    expect(getGameMotif('maze')).toBe('grid');
    expect(getGameMotif('memorymatch')).toBe('grid');
    // Anything unmapped reads as a routed path.
    expect(getGameMotif('wire')).toBe('path');
    expect(getGameMotif('cipher')).toBe('path');
    expect(getGameMotif('custom')).toBe('path');
  });

  it('renders the motif-specific class and is decorative', () => {
    const { container } = render(<GameThumbnail type="tetris" />);
    const thumb = container.querySelector('.game-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb).toHaveClass('game-thumb--stack');
    expect(thumb).toHaveAttribute('aria-hidden', 'true');
    // Stack motif shows three falling blocks over a floor.
    expect(container.querySelectorAll('.thumb-block')).toHaveLength(3);
  });

  it('renders a dial motif with a needle for timing games', () => {
    const { container } = render(<GameThumbnail type="timing" />);
    expect(container.querySelector('.game-thumb--dial')).not.toBeNull();
    expect(container.querySelector('.thumb-needle')).not.toBeNull();
  });
});
