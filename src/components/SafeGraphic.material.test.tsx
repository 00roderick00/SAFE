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

  it('breached keeps its crack path and recovering/exposed keep the scan line', () => {
    const { container: breachedC } = render(<SafeGraphic state="breached" />);
    expect(svgOf(breachedC).querySelector('path[stroke="#fff"]')).not.toBeNull();

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
    // change starts emitting geometry per-pixel.
    expect(svgOf(container).querySelectorAll('*').length).toBeLessThan(260);
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
