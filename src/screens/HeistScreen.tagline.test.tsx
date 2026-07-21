/**
 * UX-FINDINGS P2.2: a bot's flavor tagline ("Untouchable") sat directly
 * under the name where a status label would be, so it could read as game
 * state ("can't attack"). It now renders as an italic, quoted callsign in
 * a dedicated flavor element — visually separate from the difficulty
 * status and the StateBadge statuses.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { usePlayerStore } from '../store/playerStore';
import type { BotSafe } from '../types';

vi.mock('../services/useSession', () => ({ useSession: () => null }));

import { HeistScreen } from './HeistScreen';

const target: BotSafe = {
  id: 'qa-vault',
  ownerName: 'Night Warden',
  safeBalance: 2_000,
  securityScore: 52,
  securityLoadout: {
    effectiveScore: 52,
    modules: [{ id: 'qa-pattern', type: 'pattern', difficulty: 0.4, weight: 1, name: 'Pattern Lock', description: '' }],
  },
  difficultyBand: 'tricky',
  lootRange: 'moderate',
  attackFee: 40,
  lastAttackedAt: null,
  attackCooldownUntil: null,
  isBotTarget: true,
  tagline: 'Untouchable',
};

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  useHeistStore.getState().resetHeist();
  useGameStore.setState({ botSafes: [target], targetsSource: 'local', recentlyAttacked: [], refreshBotSafes: vi.fn() });
});

describe('bot tagline is presented as flavor, not status', () => {
  it('renders the tagline as an italic quoted callsign, separate from status', async () => {
    render(<MemoryRouter><HeistScreen /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Expose for .* minutes/i }));

    const flavor = await screen.findByText(/Untouchable/);
    // It's the dedicated flavor element (em), quoted, not a status badge.
    expect(flavor.tagName).toBe('EM');
    expect(flavor).toHaveClass('dossier-card__flavor');
    expect(flavor.textContent).toContain('“Untouchable”');
    expect(flavor.closest('.state-badge')).toBeNull();

    // The actual status (difficulty) is a separate element.
    expect(screen.getByText('Tricky system')).toBeInTheDocument();
  });
});
