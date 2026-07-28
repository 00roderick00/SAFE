/**
 * Progressive-disclosure ladder (TACTILE-REDESIGN §3): the bottom nav
 * stages surfaces by tier, locked tiers stay visible with their unlock
 * condition, unlocks are announced once (skippable), and grandfathered
 * accounts never see tier-0 or catch-up fanfare.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import type { AttackResult } from '../types';

const renderNav = () =>
  render(
    <MemoryRouter>
      <Layout>
        <div>content</div>
      </Layout>
    </MemoryRouter>
  );

const fakeAttack = (n: number, success = false): AttackResult => ({
  id: `atk-${n}`,
  timestamp: Date.now(),
  targetId: `t-${n}`,
  targetName: 'Bot',
  success,
  moduleScores: [],
  totalScore: 0,
  threshold: 1,
  stakePaid: 10,
  lootGained: 0,
  platformFee: 0,
});

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
});

describe('tier 0 — new player', () => {
  it('shows Safe + Heist as links; Security, History and Create visibly locked with conditions', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Safe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Heist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Security — locked\. Complete your first heist/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History — locked/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create — locked\. Complete 5 heists/ })).toBeInTheDocument();
  });

  it('pre-fills the default loadout with the three simplest tap games, keypad first', () => {
    const types = usePlayerStore.getState().securityLoadout.modules.map((m) => m.type);
    expect(types).toEqual(['keypad', 'slider', 'memorymatch']);
  });
});

describe('tier progression through play', () => {
  it('unlocks Security + History after the first completed heist (win or lose) and announces it', async () => {
    renderNav();
    act(() => {
      useGameStore.getState().addAttackResult(fakeAttack(1, false));
    });
    // Announced…
    const dialog = screen.getByRole('dialog', { name: 'New features unlocked' });
    expect(dialog).toHaveTextContent('Security & History unlocked');
    // …skippable…
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // …and actually unlocked.
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/history');
    // Create still locked.
    expect(screen.getByRole('button', { name: /Create — locked/ })).toBeInTheDocument();
  });

  it('does not re-announce a tier that was already announced', () => {
    act(() => {
      useGameStore.getState().addAttackResult(fakeAttack(1, false));
    });
    usePlayerStore.getState().markTierAnnounced(1);
    renderNav();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a first successful breach fast-tracks Create (tier 3)', () => {
    renderNav();
    act(() => {
      useGameStore.getState().addAttackResult(fakeAttack(1, true));
      usePlayerStore.getState().recordSuccessfulHeist();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/custom-games');
  });

  it('five losses also reach tier 3', () => {
    act(() => {
      for (let i = 0; i < 5; i++) useGameStore.getState().addAttackResult(fakeAttack(i, false));
    });
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('link', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
  });
});

describe('grandfathering', () => {
  it('server-hydrated progression unlocks everything with NO catch-up announcement', () => {
    act(() => {
      usePlayerStore.getState().setProgressionFromServer(12, 4);
    });
    renderNav();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create' })).toBeInTheDocument();
  });

  it('server counts never regress local progression', () => {
    act(() => {
      usePlayerStore.getState().setProgressionFromServer(12, 4);
      usePlayerStore.getState().setProgressionFromServer(0, 0);
    });
    expect(usePlayerStore.getState().completedHeists).toBe(12);
    expect(usePlayerStore.getState().successfulHeists).toBe(4);
  });
});

describe('locked nav items are discoverable on TOUCH (no hover tooltip)', () => {
  // A dimmed icon whose only explanation lives in `title`/`aria-label`
  // is invisible to a mobile player: touch has no hover. Every locked
  // item must therefore be tappable and reveal the reason.
  it('every locked item is a real button, not an inert element', () => {
    renderNav();
    for (const label of ['Security', 'History', 'Create']) {
      const item = screen.getByRole('button', { name: new RegExp(`^${label} — locked`) });
      expect(item.tagName).toBe('BUTTON');
      expect(item).toHaveAttribute('aria-haspopup', 'dialog');
      // Not disabled — a disabled control cannot be tapped to explain itself.
      expect(item).not.toBeDisabled();
    }
  });

  it('tapping a locked item reveals the unlock condition and progress as visible text', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /^Security — locked/ }));

    const sheet = screen.getByRole('dialog', { name: 'Security is locked' });
    expect(sheet).toBeInTheDocument();
    // The condition is rendered TEXT CONTENT, not a hover-only
    // title/aria attribute — that is the whole point on touch.
    expect(sheet.textContent).toContain('Complete your first heist');
    expect(sheet.textContent).toContain('0 of 1 heist completed');
    expect(screen.getByText('Complete your first heist')).toBeInTheDocument();
    // And it offers the action that actually unlocks it.
    expect(screen.getByRole('button', { name: 'Start a heist' })).toBeInTheDocument();
  });

  it('the sheet is dismissible', async () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /^Create — locked/ }));
    expect(screen.getByRole('dialog', { name: 'Create is locked' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create is locked' })).not.toBeInTheDocument());
  });

  it('each locked surface explains ITSELF, not a generic message', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /^Create — locked/ }));
    const sheet = screen.getByRole('dialog', { name: 'Create is locked' });
    expect(sheet.textContent).toContain('Complete 5 heists');
    expect(sheet.textContent).toContain('AI Workshop');
    // Security's copy must NOT appear on Create's sheet.
    expect(sheet.textContent).not.toContain('Complete your first heist');
  });

  it('unlocked items stay ordinary links with no sheet', () => {
    act(() => { usePlayerStore.getState().setProgressionFromServer(12, 4); });
    renderNav();
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security');
    expect(screen.queryByRole('button', { name: /locked/ })).not.toBeInTheDocument();
  });
});
