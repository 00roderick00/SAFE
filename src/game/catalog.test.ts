import { describe, expect, it } from 'vitest';
import { getCatalogMeta, getDefenseMix, getGameStatus, isFeatured, FEATURED_GAMES } from './catalog';

describe('defense catalog metadata', () => {
  it('describes games without emoji-only meaning', () => {
    expect(getCatalogMeta('pattern')).toMatchObject({ skills: ['Memory', 'Precision'], control: 'Touch / pointer' });
  });

  it('finds gaps in a defensive mix', () => {
    const mix = getDefenseMix(['pattern', 'sequence', 'colorcode']);
    expect(mix.gaps).toContain('Logic');
    expect(mix.covered).toContain('Memory');
  });
});

describe('featured / experimental roster (Section 4/6)', () => {
  it('curates a 6-9 game launch roster spanning skills', () => {
    expect(FEATURED_GAMES.size).toBeGreaterThanOrEqual(6);
    // 9th slot added for chesspuzzle (tactile redesign §2).
    expect(FEATURED_GAMES.size).toBeLessThanOrEqual(9);
  });

  it('marks reference-quality games as Featured', () => {
    for (const type of ['pattern', 'safedial', 'timing', 'tetris'] as const) {
      expect(isFeatured(type)).toBe(true);
      expect(getGameStatus(type)).toEqual({ status: 'featured', label: 'Featured' });
    }
  });

  it('marks non-roster games as Experimental (never "Calibration pending")', () => {
    const s = getGameStatus('pacman');
    expect(s).toEqual({ status: 'experimental', label: 'Experimental' });
    expect(s.label).not.toMatch(/calibrat/i);
  });
});
