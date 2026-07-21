/**
 * Section 6 catalog corrections:
 *  - Configuring an existing lock opens on THAT game's category, not the
 *    usually-empty Community tab.
 *  - Built-in games show an honest Featured/Experimental status, never
 *    the misleading "Calibration pending".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../services/api', () => ({
  api: {
    listMarketplaceGames: vi.fn().mockResolvedValue([]),
    listOwnCustomGames: vi.fn().mockResolvedValue([]),
    updateLoadout: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));
vi.mock('../services/useSession', () => ({ useSession: () => null }));
vi.mock('../components/minigames', () => ({
  MiniGameHost: () => null,
  preloadMiniGames: () => {},
}));

import { GamePickerScreen } from './GamePickerScreen';
import { usePlayerStore } from '../store/playerStore';

beforeEach(() => {
  usePlayerStore.getState().resetPlayer(); // default loadout: pattern (classic), keypad, timing
});

const renderPicker = (slot: number) =>
  render(
    <MemoryRouter initialEntries={[`/security/pick/${slot}`]}>
      <Routes>
        <Route path="/security/pick/:slotIndex" element={<GamePickerScreen />} />
      </Routes>
    </MemoryRouter>
  );

describe('GamePicker catalog', () => {
  it('opens on the current lock’s own category, not Community', () => {
    renderPicker(0); // slot 0 default = pattern (classic → "Locks")
    expect(screen.getByRole('button', { name: 'Locks' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Community' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows Featured/Experimental status, never "Calibration pending"', () => {
    renderPicker(0);
    // Pattern Lock is in the featured roster.
    expect(screen.getAllByText('Featured').length).toBeGreaterThan(0);
    expect(screen.queryByText(/calibration pending/i)).not.toBeInTheDocument();
  });
});
