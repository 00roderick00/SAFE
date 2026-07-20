/**
 * UX-FINDINGS P2.1 (noir retheme) + P2.3 (rejected placeholder), verified
 * in a real render: the screen uses the tactical-header vocabulary and a
 * moderation-rejected game shows a placeholder instead of its raw prompt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listOwnCustomGames = vi.fn();
vi.mock('../services/api', () => ({
  api: { listOwnCustomGames: (...a: unknown[]) => listOwnCustomGames(...a), generateGame: vi.fn(), listMarketplaceGames: vi.fn() },
}));
vi.mock('../services/useSession', () => ({ useSession: () => ({ user: { id: 'u1' } }) }));

import { CustomGameScreen } from './CustomGameScreen';
import type { CustomGame } from '../services/api';

const OFFENSIVE_PROMPT = 'RAW-OFFENSIVE-TEST-PROMPT-should-not-render';

const liveGame: CustomGame = {
  id: 'g-live', creator_id: 'u1', name: 'Speedrun Maze', description: 'a fast maze', prompt: 'a fast maze',
  base_engine: 'maze', mode: 'engine_config', config: {}, dsl_program: null, stated_difficulty: 0.5,
  calibrated_difficulty: 0.5, calibration_stats: { passes: true, solveRate: 0.5 }, status: 'live', plays: 3,
  created_at: '2026-07-19T00:00:00Z',
};
const rejectedGame: CustomGame = {
  ...liveGame, id: 'g-rej', name: 'Blocked One', description: OFFENSIVE_PROMPT, prompt: OFFENSIVE_PROMPT,
  calibrated_difficulty: null, calibration_stats: { passes: false, reason: 'moderation' }, status: 'rejected',
};

beforeEach(() => {
  vi.clearAllMocks();
  listOwnCustomGames.mockResolvedValue([liveGame, rejectedGame]);
});

const renderScreen = () => render(<MemoryRouter><CustomGameScreen /></MemoryRouter>);

describe('CustomGameScreen noir retheme + rejected placeholder', () => {
  it('renders the noir tactical header', () => {
    renderScreen();
    expect(screen.getByText('AI WORKSHOP')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custom Games' })).toBeInTheDocument();
  });

  it('hides a moderation-rejected prompt behind a placeholder', async () => {
    renderScreen();
    // Live game renders normally.
    expect(await screen.findByText('Speedrun Maze')).toBeInTheDocument();
    // Rejected game shows the placeholder, never the raw offensive prompt.
    expect(screen.getByText(/Original prompt hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(OFFENSIVE_PROMPT)).not.toBeInTheDocument();
    // And a noir status badge, not the old pill.
    expect(screen.getByText('Rejected: moderation')).toBeInTheDocument();
  });
});
