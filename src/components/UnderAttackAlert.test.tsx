/**
 * The live "you are being raided" banner.
 *
 * It is fed only by real attack rows (see useDefenseWatch), so the
 * component's job is narrow: name the raider legibly, stay out of the
 * way of the attack flow, and respect reduced motion. It must never
 * appear when there is nothing attacking.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnderAttackAlert } from './UnderAttackAlert';
import type { InFlightAttack } from '../services/api';

const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => reduceMotion.value }));

const attack = (over: Partial<InFlightAttack> = {}): InFlightAttack => ({
  attackId: 'a1',
  attackerHandle: 'trevor.mentis',
  startedAt: '2026-08-03T21:00:00.000Z',
  elapsedSeconds: 14,
  lockCount: 3,
  ...over,
});

describe('only shows for a real raid', () => {
  it('renders nothing when no attack is in flight', () => {
    const { container } = render(<UnderAttackAlert attacks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the raider', () => {
    render(<UnderAttackAlert attacks={[attack()]} />);
    expect(screen.getByText('trevor.mentis is cracking your vault')).toBeInTheDocument();
  });

  it('summarises multiple raiders rather than listing them all', () => {
    render(<UnderAttackAlert attacks={[attack(), attack({ attackId: 'a2', attackerHandle: 'burkypersonal' })]} />);
    expect(screen.getByText('2 raiders are cracking your vault')).toBeInTheDocument();
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });
});

describe('progress is elapsed time only', () => {
  it('shows seconds under a minute', () => {
    render(<UnderAttackAlert attacks={[attack({ elapsedSeconds: 14 })]} />);
    expect(screen.getByText(/^14s in/)).toBeInTheDocument();
  });

  it('shows minutes and seconds beyond one minute', () => {
    render(<UnderAttackAlert attacks={[attack({ elapsedSeconds: 80 })]} />);
    expect(screen.getByText(/^1m 20s in/)).toBeInTheDocument();
  });

  it('never claims per-lock progress — only the defender-known lock count', () => {
    render(<UnderAttackAlert attacks={[attack({ lockCount: 3 })]} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('3 locks holding');
    // "Lock 2 of 3" would mean trusting the attacker's client.
    expect(text).not.toMatch(/lock \d+ of \d+/i);
  });
});

describe('accessibility and placement', () => {
  it('announces politely without stealing focus', () => {
    render(<UnderAttackAlert attacks={[attack()]} />);
    const alert = screen.getByRole('status');
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveAttribute('aria-label', 'trevor.mentis is cracking your vault');
  });

  it('is not a dialog — it must not block the attack flow', () => {
    render(<UnderAttackAlert attacks={[attack()]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('reduced motion', () => {
  it('drops the pulse but keeps the alert', () => {
    reduceMotion.value = true;
    render(<UnderAttackAlert attacks={[attack()]} />);
    const alert = screen.getByRole('status');
    expect(alert.className).not.toContain('under-attack-alert--pulse');
    expect(alert).toHaveTextContent('cracking your vault');
    reduceMotion.value = false;
  });

  it('pulses when motion is allowed', () => {
    reduceMotion.value = false;
    render(<UnderAttackAlert attacks={[attack()]} />);
    expect(screen.getByRole('status').className).toContain('under-attack-alert--pulse');
  });
});
