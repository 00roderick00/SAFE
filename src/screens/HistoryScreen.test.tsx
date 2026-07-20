/**
 * UX-FINDINGS P1.1: settled server attacks (and defenses) must show up in
 * the History screen, not just as a transient notification. These tests
 * feed server-shaped rows (via the same mappers AttackScreen/HomeScreen
 * now use) into the game store and assert History renders them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HistoryScreen } from './HistoryScreen';
import { useGameStore } from '../store/gameStore';
import { buildServerAttackResult, buildServerDefenseEvent } from '../game/history';

beforeEach(() => {
  useGameStore.setState({ attackHistory: [], defenseHistory: [], notifications: [] });
});

const renderHistory = () =>
  render(
    <MemoryRouter>
      <HistoryScreen />
    </MemoryRouter>
  );

describe('History shows server-settled fights', () => {
  it('renders a lost server attack with the forfeited stake', () => {
    const row = buildServerAttackResult(
      { attackId: 'atk-1', status: 'lost', loot: 0, platformFee: 0, stake: 31, newBalance: 969, modules: [] },
      { attackId: 'atk-1', targetName: 'roderick.jones' },
      Date.now()
    );
    useGameStore.setState({ attackHistory: [row] });
    renderHistory();
    expect(screen.getByText('Attacked roderick.jones')).toBeInTheDocument();
    expect(screen.getByText('-31')).toBeInTheDocument();
  });

  it('renders a server-resolved defense event', () => {
    const ev = buildServerDefenseEvent(
      { attacked: true, success: true, attackerName: 'trevor.mentis', feeEarned: 12, lootLost: 0 },
      Date.now()
    );
    useGameStore.setState({ defenseHistory: [ev] });
    renderHistory();
    expect(screen.getByText('Defended from trevor.mentis')).toBeInTheDocument();
    expect(screen.getByText('+12')).toBeInTheDocument();
  });
});
