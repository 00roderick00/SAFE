/**
 * Vault material pass (docs/vault-reference/*.jpg).
 *
 * Guards the two things a material change can quietly break: the
 * interactivity layered on top of the art, and the performance budget
 * that keeps it smooth on a phone.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SafeGraphic, type VaultState } from './SafeGraphic';
import type { SecurityModule } from '../types';

const LOCKS: SecurityModule[] = [
  { id: 'a', type: 'keypad', name: 'Keypad', description: '', difficulty: 0.4, weight: 1 },
  { id: 'b', type: 'slider', name: 'Slider', description: '', difficulty: 0.5, weight: 1 },
  { id: 'c', type: 'maze', name: 'Maze', description: '', difficulty: 0.6, weight: 1 },
];
const STATES: VaultState[] = ['secure', 'exposed', 'attacking', 'breached', 'recovering'];
const STATE_COLORS: Record<VaultState, string> = {
  secure: '#D8FF45',
  exposed: '#FFAE42',
  recovering: '#FFAE42',
  attacking: '#FF5B32',
  breached: '#FF5B32',
};

const svgOf = (c: HTMLElement) => c.querySelector('.tactical-vault__svg') as SVGElement;

describe('interactivity survives the material pass', () => {
  it('all three lock slots stay tappable and keep their numbering', () => {
    const onLockSelect = vi.fn();
    render(<SafeGraphic state="secure" balance={2500} locks={LOCKS} onLockSelect={onLockSelect} />);
    const buttons = screen.getAllByRole('button', { name: /^Lock \d:/ });
    expect(buttons).toHaveLength(3);
    buttons.forEach((b, i) => {
      expect(b).toHaveClass(`tactical-vault__lock--${i + 1}`);
      fireEvent.click(b);
      expect(onLockSelect).toHaveBeenLastCalledWith(i);
    });
    expect(onLockSelect).toHaveBeenCalledTimes(3);
  });

  it('lock slots are siblings of the svg, so decoration can never cover them', () => {
    const { container } = render(<SafeGraphic state="secure" locks={LOCKS} />);
    const svg = svgOf(container);
    for (const b of screen.getAllByRole('button', { name: /^Lock \d:/ })) {
      expect(svg.contains(b)).toBe(false);
    }
  });

  it('the decorative svg stays hidden from assistive tech', () => {
    const { container } = render(<SafeGraphic state="secure" locks={LOCKS} />);
    expect(svgOf(container)).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('every state still reads', () => {
  it.each(STATES)('%s tints the material, not just an outline', (state) => {
    const { container } = render(<SafeGraphic state={state} balance={100} locks={LOCKS} />);
    const svg = svgOf(container);
    const color = STATE_COLORS[state];

    // The state colour reaches a gradient that fills the door face —
    // i.e. the metal takes the cast — not only stroked outlines.
    const tintStops = [...svg.querySelectorAll('radialGradient stop')]
      .filter((s) => (s.getAttribute('stop-color') ?? '').toUpperCase() === color);
    expect(tintStops.length, `${state} has no tinted gradient stop`).toBeGreaterThan(0);

    const tintGradient = tintStops[0].closest('radialGradient') as SVGElement;
    const filled = [...svg.querySelectorAll('circle')].some(
      (c) => (c.getAttribute('fill') ?? '').includes(tintGradient.id)
    );
    expect(filled, `${state} tint gradient is not painted onto a face`).toBe(true);
  });

  it('breached reads through MATERIAL, not a drawn crack line', () => {
    const { container } = render(<SafeGraphic state="breached" />);
    const svg = svgOf(container);

    // The white zig-zag read as a rendering glitch rather than damage.
    // Nothing in the breached vault may draw a bright graphic stroke.
    const brightStrokes = [...svg.querySelectorAll('path, line, polyline')].filter((el) => {
      const stroke = (el.getAttribute('stroke') ?? '').toLowerCase();
      return stroke === '#fff' || stroke === '#ffffff' || stroke === 'white';
    });
    expect(brightStrokes).toHaveLength(0);

    // Instead: the shadowed interior is revealed behind the sprung door…
    const gapGradient = [...svg.querySelectorAll('linearGradient')].find((g) => g.id.startsWith('breach-gap'));
    expect(gapGradient, 'breach gap gradient missing').toBeDefined();
    const gapPainted = [...svg.querySelectorAll('rect')].some(
      (r) => (r.getAttribute('fill') ?? '').includes(gapGradient!.id)
    );
    expect(gapPainted, 'breach gap is not painted').toBe(true);

    // …and the door keeps the cues that already said "breached".
    expect(svg.querySelector('circle[stroke-dasharray="24 14"]'), 'state ring lost its breached dash').not.toBeNull();
  });

  it('non-breached states draw no breach gap', () => {
    for (const state of ['secure', 'exposed', 'attacking', 'recovering'] as const) {
      const { container } = render(<SafeGraphic state={state} />);
      const svg = svgOf(container);
      const gap = [...svg.querySelectorAll('linearGradient')].find((g) => g.id.startsWith('breach-gap'));
      const painted = [...svg.querySelectorAll('rect')].some(
        (r) => gap && (r.getAttribute('fill') ?? '').includes(gap.id)
      );
      expect(painted, `${state} should not show the breach gap`).toBe(false);
    }
  });

  it('recovering/exposed keep the scan line', () => {
    for (const state of ['exposed', 'attacking', 'recovering'] as const) {
      const { container } = render(<SafeGraphic state={state} />);
      const scan = [...svgOf(container).querySelectorAll('path')].some(
        (p) => p.getAttribute('d') === 'M76 76L244 244'
      );
      expect(scan, `${state} lost its scan line`).toBe(true);
    }
  });

  it('the six locking bolts are distributed around the door, not stacked', () => {
    // Regression: the previous px-based transformOrigin never applied,
    // so all six rendered at 12 o'clock.
    const { container } = render(<SafeGraphic state="secure" />);
    const rotations = [...svgOf(container).querySelectorAll('g[transform^="rotate("]')]
      .map((g) => g.getAttribute('transform'))
      .filter((t) => t?.includes('160 160'));
    for (const angle of [0, 60, 120, 180, 240, 300]) {
      expect(rotations).toContain(`rotate(${angle} 160 160)`);
    }
  });
});

describe('bolt hardware', () => {
  it('each bolt reads as a cylinder: across-axis shading, end cap and seams', () => {
    const { container } = render(<SafeGraphic state="secure" />);
    const svg = svgOf(container);
    const barrel = [...svg.querySelectorAll('linearGradient')].find((g) => g.id.startsWith('bolt-barrel'));
    const cap = [...svg.querySelectorAll('linearGradient')].find((g) => g.id.startsWith('bolt-cap'));
    expect(barrel, 'bolt barrel gradient missing').toBeDefined();
    expect(cap, 'bolt cap gradient missing').toBeDefined();

    // Shading runs ACROSS the bolt (x1->x2, flat in y) — that is what
    // separates a cylinder from a flat pill.
    expect(barrel!.getAttribute('y1')).toBe(barrel!.getAttribute('y2'));
    expect(barrel!.getAttribute('x1')).not.toBe(barrel!.getAttribute('x2'));

    const barrels = [...svg.querySelectorAll('rect')].filter((r) => (r.getAttribute('fill') ?? '').includes(barrel!.id));
    const caps = [...svg.querySelectorAll('rect')].filter((r) => (r.getAttribute('fill') ?? '').includes(cap!.id));
    expect(barrels).toHaveLength(6);
    expect(caps).toHaveLength(12); // end cap + collar per bolt
  });
});

describe('shadow tones are cool blue-steel, not neutral grey', () => {
  it('the dark end of the metal gradients is blue-biased', () => {
    const { container } = render(<SafeGraphic state="secure" />);
    const svg = svgOf(container);
    const darkStops = [...svg.querySelectorAll('linearGradient stop, radialGradient stop')]
      .map((s2) => s2.getAttribute('stop-color') ?? '')
      .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      .map((c) => ({ c, r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) }))
      // Shadow tones only: the darkest third of the ramp.
      .filter((x) => x.r + x.g + x.b < 190 && x.r + x.g + x.b > 0);

    expect(darkStops.length).toBeGreaterThan(4);
    for (const { c, r, b } of darkStops) {
      expect(b, `${c} should be blue-biased (b > r)`).toBeGreaterThan(r);
    }
  });
});

describe('performance budget', () => {
  it('uses no per-pixel filters (feTurbulence / feSpecularLighting / feDisplacementMap)', () => {
    for (const state of STATES) {
      const { container } = render(<SafeGraphic state={state} />);
      const svg = svgOf(container);
      expect(svg.querySelector('feTurbulence'), `${state}`).toBeNull();
      expect(svg.querySelector('feSpecularLighting'), `${state}`).toBeNull();
      expect(svg.querySelector('feDiffuseLighting'), `${state}`).toBeNull();
      expect(svg.querySelector('feDisplacementMap'), `${state}`).toBeNull();
    }
  });

  it('keeps exactly one small blur filter (the pre-existing hub glow)', () => {
    const { container } = render(<SafeGraphic state="secure" />);
    const filters = svgOf(container).querySelectorAll('filter');
    expect(filters).toHaveLength(1);
    expect(filters[0].querySelectorAll('feGaussianBlur')).toHaveLength(1);
  });

  it('stays within a sane node budget per vault', () => {
    const { container } = render(<SafeGraphic state="secure" balance={100} locks={LOCKS} />);
    // Guard rail: the material is layered gradients + hairlines, so the
    // count should stay in the low hundreds. Fail loudly if a future
    // change starts emitting geometry per-pixel. Raised from 260 when
    // the six bolts became real hardware (barrel + collar + end cap +
    // seam + seat shadow each) rather than single rounded rects.
    expect(svgOf(container).querySelectorAll('*').length).toBeLessThan(275);
  });

  it('grain and numerals are deterministic across renders (no Math.random)', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = render(<SafeGraphic state="secure" />);
    const b = render(<SafeGraphic state="secure" />);
    expect(spy).not.toHaveBeenCalled();
    const radii = (c: HTMLElement) =>
      [...svgOf(c).querySelectorAll('circle')].map((el) => el.getAttribute('r')).join(',');
    expect(radii(a.container)).toBe(radii(b.container));
    spy.mockRestore();
  });

  it('gradient ids are namespaced per instance so two vaults cannot share a tint', () => {
    const { container } = render(
      <div>
        <SafeGraphic state="secure" />
        <SafeGraphic state="breached" />
      </div>
    );
    const ids = [...container.querySelectorAll('linearGradient[id], radialGradient[id], clipPath[id], filter[id]')]
      .map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
