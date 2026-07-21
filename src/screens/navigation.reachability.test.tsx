/**
 * The AI game builder (/custom-games) and marketplace (/marketplace)
 * were orphaned — no UI navigation reached them. These tests assert the
 * new entry points actually route there:
 *   1. the bottom-nav "Create" item links to /custom-games;
 *   2. the Security screen's "Build a game" / "Browse community games"
 *      actions navigate to /custom-games and /marketplace;
 *   3. the slot picker surfaces live custom games + a "Browse all" link
 *      to the marketplace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---- Mocks (only the slot-picker test touches these) --------------
const listMarketplaceGames = vi.fn();
const listOwnCustomGames = vi.fn();
const updateLoadout = vi.fn().mockResolvedValue(undefined);
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

vi.mock('../services/api', () => ({
  api: {
    listMarketplaceGames: (...a: unknown[]) => listMarketplaceGames(...a),
    listOwnCustomGames: (...a: unknown[]) => listOwnCustomGames(...a),
    updateLoadout: (...a: unknown[]) => updateLoadout(...a),
  },
}));
vi.mock('../services/supabaseClient', () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));
vi.mock('../services/useSession', () => ({ useSession: () => ({ user: { id: 'u1' } }) }));

import { Layout } from '../components/Layout';
import { SecurityScreen } from './SecurityScreen';
import { GamePickerScreen } from './GamePickerScreen';
import { usePlayerStore } from '../store/playerStore';
import type { PublicCustomGame } from '../services/api';

const COMMUNITY_GAME: PublicCustomGame = {
  id: 'cg-1',
  creator_id: 'creator-9',
  creator_handle: 'trevor',
  name: 'Warden Run',
  description: 'dodge the warden',
  prompt: 'dodge the warden',
  base_engine: 'maze',
  mode: 'dsl_program',
  config: {},
  dsl_program: { version: 1, board: { width: 8, height: 8 }, entities: [], timeLimit: 30, winCondition: 'reach_goal' },
  stated_difficulty: 0.5,
  calibrated_difficulty: 0.5,
  calibration_stats: null,
  status: 'live',
  plays: 2,
  created_at: '2026-07-18T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  listMarketplaceGames.mockResolvedValue([]);
  listOwnCustomGames.mockResolvedValue([]);
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  usePlayerStore.getState().resetPlayer();
});

describe('main-nav entry point', () => {
  it('bottom nav has a "Create" item linking to /custom-games', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /create/i });
    expect(link).toHaveAttribute('href', '/custom-games');
  });
});

describe('Security screen actions', () => {
  const renderSecurity = () =>
    render(
      <MemoryRouter initialEntries={['/security']}>
        <Routes>
          <Route path="/security" element={<SecurityScreen />} />
          <Route path="/custom-games" element={<div>BUILDER SCREEN</div>} />
          <Route path="/marketplace" element={<div>MARKETPLACE SCREEN</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('"Build a game" navigates to the builder (/custom-games)', () => {
    renderSecurity();
    fireEvent.click(screen.getByText('Build a game'));
    expect(screen.getByText('BUILDER SCREEN')).toBeInTheDocument();
  });

  it('"Browse community games" navigates to the marketplace', () => {
    renderSecurity();
    fireEvent.click(screen.getByText('Browse community games'));
    expect(screen.getByText('MARKETPLACE SCREEN')).toBeInTheDocument();
  });

  it('labels every lock action and supports reordering and full-sequence testing', async () => {
    renderSecurity();
    expect(screen.getByRole('region', { name: 'Defensive mix analysis' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Equipped lock sequence' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Pattern Lock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace Pattern Lock' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Keypad earlier' }));
    expect(usePlayerStore.getState().securityLoadout.modules[0].type).toBe('keypad');
    await waitFor(() => expect(updateLoadout).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Test full sequence/i }));
    expect(screen.getByRole('dialog', { name: 'Keypad' })).toBeInTheDocument();
    expect(screen.getByText('Practice only. No stake, loot, or balance changes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close defense test' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Slot picker offers custom/community games', () => {
  const renderPicker = () =>
    render(
      <MemoryRouter initialEntries={['/security/pick/0']}>
        <Routes>
          <Route path="/security/pick/:slotIndex" element={<GamePickerScreen />} />
          <Route path="/security" element={<div>SECURITY SCREEN</div>} />
          <Route path="/marketplace" element={<div>MARKETPLACE SCREEN</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('lists a live community game as an equippable option', async () => {
    listMarketplaceGames.mockResolvedValue([COMMUNITY_GAME]);
    renderPicker();
    // The picker opens on the current lock's category; switch to Community.
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    expect(await screen.findByText('Warden Run')).toBeInTheDocument();
  });

  it('has a "Browse all" link that reaches the marketplace', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    fireEvent.click(await screen.findByText('Browse all'));
    await waitFor(() => expect(screen.getByText('MARKETPLACE SCREEN')).toBeInTheDocument());
  });

  it('supports search, favorites, continuous difficulty, and saving a built-in game', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Arcade' }));
    const search = screen.getByRole('searchbox', { name: 'Search games' });
    // "tetris" is internally preserved but publicly de-branded to "Stack Breach".
    fireEvent.change(search, { target: { value: 'Stack Breach' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Stack Breach to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Stack Breach' }));

    const difficulty = screen.getByRole('slider', { name: /Difficulty/i });
    fireEvent.change(difficulty, { target: { value: '0.78' } });
    expect(screen.getByText(/78% · Punishing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save lock/i }));

    await waitFor(() => expect(screen.getByText('SECURITY SCREEN')).toBeInTheDocument());
    // Internal id stays "tetris" (backward compatibility); public name is new.
    expect(usePlayerStore.getState().securityLoadout.modules[0]).toMatchObject({ type: 'tetris', difficulty: .78, name: 'Stack Breach' });
    expect(updateLoadout).toHaveBeenCalledTimes(1);
  });
});
