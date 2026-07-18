/**
 * Regression test for the flaky-equip bug (TESTING-FINDINGS P1.1): the
 * FIRST "Slot N" click must persist to the server exactly once. The old
 * code read a stale loadout, used getUser() (which could transiently
 * return no user and silently skip the write), and updated local state
 * before the server write. This test drives a single click and asserts
 * api.updateLoadout was called once with the equipped module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---- Mocks --------------------------------------------------------
const updateLoadout = vi.fn().mockResolvedValue(undefined);
const listMarketplaceGames = vi.fn();
const getSession = vi.fn();
const navigate = vi.fn();

vi.mock('../services/api', () => ({
  api: {
    listMarketplaceGames: (...a: unknown[]) => listMarketplaceGames(...a),
    updateLoadout: (...a: unknown[]) => updateLoadout(...a),
  },
}));

vi.mock('../services/supabaseClient', () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

vi.mock('react-router-dom', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigate };
});

import { MarketplaceScreen } from './MarketplaceScreen';
import { usePlayerStore } from '../store/playerStore';
import type { PublicCustomGame } from '../services/api';

const DSL_GAME: PublicCustomGame = {
  id: 'game-abc',
  creator_id: 'creator-1',
  creator_handle: 'trevor',
  name: 'Chase Maze',
  description: 'dodge the enemy',
  prompt: 'dodge the enemy',
  base_engine: 'maze',
  mode: 'dsl_program',
  config: {},
  dsl_program: { version: 1, board: { width: 8, height: 8 }, entities: [], timeLimit: 30, winCondition: 'reach_goal' },
  stated_difficulty: 0.5,
  calibrated_difficulty: 0.55,
  calibration_stats: null,
  status: 'live',
  plays: 3,
  created_at: '2026-07-18T00:00:00Z',
};

function renderScreen() {
  return render(
    <MemoryRouter>
      <MarketplaceScreen />
    </MemoryRouter>
  );
}

describe('MarketplaceScreen equip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMarketplaceGames.mockResolvedValue([DSL_GAME]);
    getSession.mockResolvedValue({ data: { session: { user: { id: 'me-123' } } } });
    // Reset the store to a known 3-module default loadout.
    usePlayerStore.getState().resetPlayer();
  });

  it('persists to the server on the FIRST slot click', async () => {
    renderScreen();
    const slot1 = await screen.findByLabelText('Equip Chase Maze to slot 1');

    fireEvent.click(slot1);

    await waitFor(() => expect(updateLoadout).toHaveBeenCalledTimes(1));

    const [userId, loadout] = updateLoadout.mock.calls[0];
    expect(userId).toBe('me-123');
    // Slot 0 now holds the custom game; other slots preserved.
    expect(loadout.modules[0].customGameId).toBe('game-abc');
    expect(loadout.modules[0].id).toBe('game-abc-slot-0');
    expect(loadout.modules).toHaveLength(3);
    // Client store reflects the persisted module too.
    expect(usePlayerStore.getState().securityLoadout.modules[0].customGameId).toBe('game-abc');
    // Navigated to the vault after a confirmed write.
    expect(navigate).toHaveBeenCalledWith('/security');
  });

  it('surfaces an error and does not navigate when the session is missing', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderScreen();
    const slot1 = await screen.findByLabelText('Equip Chase Maze to slot 1');

    fireEvent.click(slot1);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(updateLoadout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
