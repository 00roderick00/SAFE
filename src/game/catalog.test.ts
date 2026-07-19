import { describe, expect, it } from 'vitest';
import { getCatalogMeta, getDefenseMix } from './catalog';

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
