import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { HomeScreen } from './HomeScreen';

vi.mock('../services/useSession', () => ({ useSession: () => null }));

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/security" element={<div>SECURITY ROUTE</div>} />
        <Route path="/heist" element={<div>HEIST ROUTE</div>} />
        <Route path="/insurance" element={<div>INSURANCE ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  useGameStore.setState({
    botSafes: [],
    attackHistory: [],
    defenseHistory: [],
    notifications: [],
    refreshBotSafes: vi.fn(),
  });
});

describe('home vault state and action QA', () => {
  it('shows honest empty history and routes a vulnerable player to defense work', () => {
    renderHome();
    expect(screen.getByRole('group', { name: /Vault secure with 1,000 tokens/i })).toBeInTheDocument();
    // The gear opens account/settings (it used to be mislabelled "Open
    // vault settings" while actually navigating to /security).
    expect(screen.getByRole('button', { name: 'Account and settings' })).toBeInTheDocument();
    expect(screen.getByText('No performance history yet')).toBeInTheDocument();
    expect(screen.queryByText(/0\/0 passed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Strengthen defenses/i }));
    expect(screen.getByText('SECURITY ROUTE')).toBeInTheDocument();
  });

  it('routes a hardened player into heist entry and exposes vault testing', () => {
    for (let index = 0; index < 3; index++) usePlayerStore.getState().setModuleDifficulty(index, 1);
    renderHome();
    expect(screen.getByRole('button', { name: /Enter heist mode/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Test my vault/i }));
    expect(screen.getByText('SECURITY ROUTE')).toBeInTheDocument();
  });

  it('presents exposure, continuing the heist, and exiting exposure as distinct actions', () => {
    usePlayerStore.getState().enterHeistMode();
    renderHome();
    expect(screen.getByRole('group', { name: /Vault exposed to attacks/i })).toBeInTheDocument();
    expect(screen.getByText(/Exposure \d+:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue heist/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit exposure' }));
    expect(usePlayerStore.getState().heistModeActive).toBe(false);
  });

  it('presents a recent failed defense as a breach with an explained net loss', () => {
    useGameStore.setState({
      defenseHistory: [{
        id: 'qa-defense',
        timestamp: Date.now(),
        attackerName: 'Red Specter',
        success: false,
        moduleResults: [],
        feeEarned: 0,
        lootLost: 120,
        insurancePayout: 20,
      }],
    });
    renderHome();
    expect(screen.getByRole('group', { name: /Vault breached/i })).toBeInTheDocument();
    expect(screen.getByText('Red Specter · -100 TK net loss')).toBeInTheDocument();
  });
});
