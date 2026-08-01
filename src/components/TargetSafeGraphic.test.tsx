/**
 * Target vault material + performance.
 *
 * The heist list renders up to ~20 of these, so the whole point of the
 * component is to share SafeGraphic's material vocabulary while staying
 * dramatically lighter. Both halves are asserted here.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SafeGraphic, TargetSafeGraphic } from './SafeGraphic';
import { BAND_COLORS, type DifficultyBand } from './vaultMaterial';

const BANDS: DifficultyBand[] = ['soft', 'tricky', 'brutal'];
const svgOf = (c: HTMLElement) => c.querySelector('svg') as SVGElement;
const nodeCount = (c: HTMLElement) => svgOf(c).querySelectorAll('*').length;
/** Elements that actually PAINT. Gradient stops live in <defs> and are
 *  never rasterised, so they are the wrong thing to budget against —
 *  this is the count that costs per-frame work while scrolling. */
const paintedCount = (c: HTMLElement) => {
  const svg = svgOf(c);
  const defs = svg.querySelector('defs');
  return [...svg.querySelectorAll('*')].filter((el) => !defs?.contains(el) && el !== defs).length;
};

describe('shares the material vocabulary with SafeGraphic', () => {
  it('uses the same gradient set, so the two cannot drift apart', () => {
    const target = render(<TargetSafeGraphic size={62} difficulty="tricky" />);
    const own = render(<SafeGraphic state="secure" />);
    const names = (c: HTMLElement) =>
      new Set(
        [...svgOf(c).querySelectorAll('linearGradient[id], radialGradient[id]')]
          .map((el) => el.id.replace(/-[^-]+$/, ''))
      );
    const targetNames = names(target.container);
    const ownNames = names(own.container);
    // The compact set is a strict subset of the full one.
    for (const n of targetNames) expect(ownNames, `${n} missing from SafeGraphic`).toContain(n);
    for (const core of ['door-metal', 'bevel', 'spec', 'door-tint', 'frame-metal']) {
      expect(targetNames).toContain(core);
    }
  });

  it('the metal takes the difficulty cast, not just a coloured outline', () => {
    for (const band of BANDS) {
      const { container } = render(<TargetSafeGraphic size={62} difficulty={band} />);
      const svg = svgOf(container);
      const tintStop = [...svg.querySelectorAll('radialGradient stop')].find(
        (s) => (s.getAttribute('stop-color') ?? '').toUpperCase() === BAND_COLORS[band]
      );
      expect(tintStop, `${band} has no tinted gradient stop`).toBeDefined();
      const gradient = tintStop!.closest('radialGradient') as SVGElement;
      const painted = [...svg.querySelectorAll('circle')].some(
        (c) => (c.getAttribute('fill') ?? '').includes(gradient.id)
      );
      expect(painted, `${band} tint is not painted onto the face`).toBe(true);
    }
  });

  it('all three bands are visually distinguishable', () => {
    const seen = BANDS.map((band) => {
      const { container } = render(<TargetSafeGraphic size={62} difficulty={band} />);
      return [...svgOf(container).querySelectorAll('[stroke],[fill]')]
        .map((el) => `${el.getAttribute('stroke')}|${el.getAttribute('fill')}`)
        .filter((v) => v.toUpperCase().includes(BAND_COLORS[band]))
        .length;
    });
    // Each band actually paints its own colour somewhere.
    for (const count of seen) expect(count).toBeGreaterThan(0);
    expect(new Set(Object.values(BAND_COLORS)).size).toBe(3);
  });
});

describe('performance: light enough for a full target list', () => {
  it('a 62px card avatar is a small fraction of SafeGraphic', () => {
    const card = render(<TargetSafeGraphic size={62} />);
    const own = render(<SafeGraphic state="secure" />);
    // What actually costs frames while scrolling a list:
    expect(paintedCount(card.container)).toBeLessThan(20);
    expect(paintedCount(card.container) * 20).toBeLessThan(paintedCount(own.container) * 2);
    // Total nodes (incl. non-painting gradient stops) stay modest too.
    expect(nodeCount(card.container)).toBeLessThan(60);
    expect(nodeCount(card.container)).toBeLessThan(nodeCount(own.container) / 3);
  });

  it('the hero at 170px is richer but still far lighter than SafeGraphic', () => {
    const hero = render(<TargetSafeGraphic size={170} />);
    const card = render(<TargetSafeGraphic size={62} />);
    const own = render(<SafeGraphic state="secure" />);
    expect(nodeCount(hero.container)).toBeGreaterThan(nodeCount(card.container));
    expect(nodeCount(hero.container)).toBeLessThan(nodeCount(own.container) / 3);
  });

  it('uses no per-pixel filters', () => {
    const { container } = render(<TargetSafeGraphic size={170} />);
    const svg = svgOf(container);
    expect(svg.querySelector('feTurbulence')).toBeNull();
    expect(svg.querySelector('feSpecularLighting')).toBeNull();
    expect(svg.querySelector('feDiffuseLighting')).toBeNull();
    expect(svg.querySelector('filter')).toBeNull();
  });
});

describe('ids are namespaced per instance', () => {
  it('twenty cards on screen do not share gradient ids', () => {
    const { container } = render(
      <div>
        {BANDS.flatMap((band) =>
          Array.from({ length: 7 }, (_, i) => (
            <TargetSafeGraphic key={`${band}-${i}`} size={62} difficulty={band} />
          ))
        )}
      </div>
    );
    const ids = [...container.querySelectorAll('linearGradient[id], radialGradient[id], clipPath[id]')]
      .map((el) => el.id);
    expect(ids.length).toBeGreaterThan(100);
    expect(new Set(ids).size, 'duplicate ids would make one card tint them all').toBe(ids.length);
  });
});
