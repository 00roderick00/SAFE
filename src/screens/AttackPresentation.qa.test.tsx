import { act, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayoutPresentation } from '../game/presentation';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { usePlayerStore } from '../store/playerStore';
import type { BotSafe, MiniGameResult, ModuleType } from '../types';

type MotionProps<T extends HTMLElement> = HTMLAttributes<T> & {
  children?: ReactNode;
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    section: (props: MotionProps<HTMLElement>) => {
      const clean = { ...props };
      delete clean.initial;
      delete clean.animate;
      delete clean.exit;
      delete clean.transition;
      return <section {...clean} />;
    },
    div: (props: MotionProps<HTMLDivElement>) => {
      const clean = { ...props };
      delete clean.initial;
      delete clean.animate;
      delete clean.exit;
      delete clean.transition;
      return <div {...clean} />;
    },
  },
  useReducedMotion: () => true,
}));

vi.mock('../components/minigames', () => ({
  MiniGameHost: ({
    moduleId,
    moduleType,
    onComplete,
  }: {
    moduleId: string;
    moduleType: ModuleType;
    onComplete: (result: MiniGameResult) => void;
  }) => (
    <div aria-label="QA minigame">
      <button onClick={() => onComplete({ moduleId, moduleType, score: .92, passed: true, timeSpent: 2_000 })}>Pass lock</button>
      <button onClick={() => onComplete({ moduleId, moduleType, score: .28, passed: false, timeSpent: 2_000 })}>Fail lock</button>
    </div>
  ),
  preloadMiniGames: () => {},
}));

import { AttackScreen } from './AttackScreen';

const target: BotSafe = {
  id: 'attack-qa-vault',
  ownerName: 'Chrome Phantom',
  safeBalance: 2_000,
  securityScore: 40,
  securityLoadout: {
    effectiveScore: 40,
    modules: [
      { id: 'attack-qa-pattern', type: 'pattern', difficulty: .4, weight: 1, name: 'Pattern Lock', description: '' },
    ],
  },
  difficultyBand: 'tricky',
  lootRange: 'moderate',
  attackFee: 40,
  lastAttackedAt: null,
  attackCooldownUntil: null,
  isBotTarget: true,
};

function renderAttack() {
  usePlayerStore.getState().withdrawTokens(target.attackFee);
  useHeistStore.getState().startAttack(target, target.attackFee);
  return render(
    <MemoryRouter initialEntries={['/attack']}>
      <Routes>
        <Route path="/attack" element={<AttackScreen />} />
        <Route path="/heist" element={<div>HEIST ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  usePlayerStore.getState().resetPlayer();
  useHeistStore.getState().resetHeist();
  useGameStore.setState({ attackHistory: [], notifications: [], botSafes: [target] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('continuous breach presentation QA', () => {
  it('keeps heist context visible and explains a successful settlement', () => {
    const balanceBefore = usePlayerStore.getState().safeBalance;
    const payout = getPayoutPresentation(target.safeBalance);
    renderAttack();

    const hud = screen.getByRole('complementary', { name: 'Breach status' });
    expect(hud).toHaveTextContent('Chrome Phantom');
    expect(hud).toHaveTextContent(`-${target.attackFee} TK`);
    expect(hud).toHaveTextContent(`+${Math.round(payout.netPayout)} TK`);
    expect(screen.getByRole('progressbar', { name: 'Overall breach progress' })).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByRole('button', { name: /Begin lock|start/i }));
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByRole('button', { name: 'Pass lock' }));
    expect(screen.getByRole('heading', { name: 'Bolt retracted' })).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_100); });
    expect(screen.getByText('NET LOOT RECEIVED').parentElement).toHaveTextContent(`+${Math.round(payout.netPayout)} TK`);
    expect(screen.getByText('Final net payout')).toBeInTheDocument();
    expect(usePlayerStore.getState().safeBalance).toBe(balanceBefore - target.attackFee + payout.netPayout);
  });

  it('shows the mechanical failure and the exact committed stake loss', () => {
    const balanceBefore = usePlayerStore.getState().safeBalance;
    renderAttack();

    fireEvent.click(screen.getByRole('button', { name: /Begin lock|start/i }));
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByRole('button', { name: 'Fail lock' }));
    expect(screen.getByRole('heading', { name: 'Bolt slammed shut' })).toBeInTheDocument();
    expect(screen.getByText(/stake will be lost/i)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_100); });
    expect(screen.getByText('STAKE DEDUCTED').parentElement).toHaveTextContent(`-${target.attackFee} TK`);
    expect(usePlayerStore.getState().safeBalance).toBe(balanceBefore - target.attackFee);
  });
});
