import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayoutPresentation } from '../game/presentation';
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
    modules: [
      { id: 'qa-pattern', type: 'pattern', difficulty: .4, weight: 1, name: 'Pattern Lock', description: '' },
      { id: 'qa-tetris', type: 'tetris', difficulty: .5, weight: 1, name: 'Tetris', description: '' },
      { id: 'qa-dial', type: 'safedial', difficulty: .6, weight: 1, name: 'Safe Dial', description: '' },
    ],
  },
  difficultyBand: 'tricky',
  lootRange: 'moderate',
  attackFee: 40,
  lastAttackedAt: null,
  attackCooldownUntil: null,
  isBotTarget: true,
};

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  useHeistStore.getState().resetHeist();
  useGameStore.setState({
    botSafes: [target],
    targetsSource: 'local',
    recentlyAttacked: [],
    refreshBotSafes: vi.fn(),
  });
});

describe('heist briefing, dossier, and confirmation QA', () => {
  it('shows the complete risk briefing before exposure', () => {
    render(<MemoryRouter><HeistScreen /></MemoryRouter>);
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('Your safe can be attacked')).toBeInTheDocument();
    expect(screen.getByText('STAKE LOST')).toBeInTheDocument();
    expect(screen.getByText('NET LOOT PAID')).toBeInTheDocument();
  });

  it('keeps stake, gross, platform cut, and final net payout consistent', async () => {
    const balanceBefore = usePlayerStore.getState().safeBalance;
    const payout = getPayoutPresentation(target.safeBalance);
    render(
      <MemoryRouter initialEntries={['/heist']}>
        <Routes>
          <Route path="/heist" element={<HeistScreen />} />
          <Route path="/attack" element={<div>ATTACK ROUTE</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Start heist exposure/i }));
    const dossier = await screen.findByRole('button', { name: /Night Warden.*net payout/i });
    expect(dossier).toHaveTextContent(`GROSS LOOT${Math.round(payout.grossLoot).toLocaleString()} TK`);
    expect(dossier).toHaveTextContent(`PLATFORM CUT-${Math.round(payout.platformCut).toLocaleString()} TK`);
    expect(dossier).toHaveTextContent(`NET WIN${Math.round(payout.netPayout).toLocaleString()} TK`);
    fireEvent.click(dossier);
    expect(screen.getByRole('dialog', { name: /Engage Night Warden/i })).toHaveTextContent(`Final net payout${Math.round(payout.netPayout).toLocaleString()} TK`);
    fireEvent.click(screen.getByRole('button', { name: /Commit stake/i }));
    expect(await screen.findByText('ATTACK ROUTE')).toBeInTheDocument();
    expect(usePlayerStore.getState().safeBalance).toBe(balanceBefore - target.attackFee);
  });
});
