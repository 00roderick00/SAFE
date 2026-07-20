/**
 * UX-FINDINGS P1.2: backing out mid-attack must not silently drop the
 * balance — it routes through the same outcome recap as a played loss,
 * showing the forfeited stake. Also asserts the abandon is logged to
 * History (P1.1).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      delete clean.initial; delete clean.animate; delete clean.exit; delete clean.transition;
      return <section {...clean} />;
    },
    div: (props: MotionProps<HTMLDivElement>) => {
      const clean = { ...props };
      delete clean.initial; delete clean.animate; delete clean.exit; delete clean.transition;
      return <div {...clean} />;
    },
  },
  useReducedMotion: () => true,
}));

vi.mock('../components/minigames', () => ({
  MiniGameHost: ({ moduleId, moduleType, onComplete }: { moduleId: string; moduleType: ModuleType; onComplete: (r: MiniGameResult) => void }) => (
    <button onClick={() => onComplete({ moduleId, moduleType, score: 0.9, passed: true, timeSpent: 1000 })}>Pass lock</button>
  ),
  preloadMiniGames: () => {},
}));

import { AttackScreen } from './AttackScreen';

const target: BotSafe = {
  id: 'abandon-qa-vault',
  ownerName: 'Chrome Phantom',
  safeBalance: 2_000,
  securityScore: 40,
  securityLoadout: {
    effectiveScore: 40,
    modules: [{ id: 'abandon-qa-pattern', type: 'pattern', difficulty: 0.4, weight: 1, name: 'Pattern Lock', description: '' }],
  },
  difficultyBand: 'tricky',
  lootRange: 'moderate',
  attackFee: 31,
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
    </MemoryRouter>
  );
}

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  useHeistStore.getState().resetHeist();
  useGameStore.setState({ attackHistory: [], notifications: [], botSafes: [target] });
});

describe('abandoning an attack shows the loss recap', () => {
  it('routes the abandon through the outcome screen with the forfeited stake', () => {
    renderAttack();

    // Back out before playing any lock.
    fireEvent.click(screen.getByRole('button', { name: /Abandon attack/i }));

    // The recap is shown (not a silent navigation to /heist).
    expect(screen.getByRole('heading', { name: 'Attack abandoned' })).toBeInTheDocument();
    expect(screen.getByText('STAKE FORFEITED').parentElement).toHaveTextContent(`-${target.attackFee} TK`);
    expect(screen.queryByText('HEIST ROUTE')).not.toBeInTheDocument();

    // And it is logged to History as a loss.
    const history = useGameStore.getState().attackHistory;
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(false);
    expect(history[0].stakePaid).toBe(target.attackFee);
  });

  it('the recap continue button leaves to the heist screen', () => {
    renderAttack();
    fireEvent.click(screen.getByRole('button', { name: /Abandon attack/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave heist' }));
    expect(screen.getByText('HEIST ROUTE')).toBeInTheDocument();
  });
});
