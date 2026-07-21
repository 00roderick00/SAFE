/**
 * UX-FINDINGS P1.2: backing out mid-attack must not silently drop the
 * balance — it routes through the same outcome recap as a played loss,
 * showing the forfeited stake. Also asserts the abandon is logged to
 * History (P1.1).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Attack abandoned')).toBeInTheDocument();
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

// --- SERVER path (signed in) ---------------------------------------
// When signed in, attacks go through startServerAttack/completeServerAttack.
// Abandoning must still land on the outcome recap (async settlement) and
// must NOT auto-navigate to /heist. UX-FINDINGS P1.2 (server path).
const serverPayload = {
  attackId: 'srv-1',
  status: 'lost' as const,
  loot: 0,
  platformFee: 0,
  stake: 31,
  newBalance: 969,
  modules: [],
};

function seedServerAttack(completeServerAttack: () => Promise<unknown>) {
  useHeistStore.setState({
    currentTarget: null,
    currentModuleIndex: 0,
    moduleResults: [],
    attackStartedAt: Date.now(),
    stakePaid: 31,
    serverAttack: {
      attackId: 'srv-1',
      defenderHandle: 'roderick.jones',
      isBotTarget: false,
      stake: 31,
      potentialLoot: 200,
      modules: [{ index: 0, moduleType: 'pattern', difficulty: 0.4, seed: 's0' }],
    },
    completeServerAttack: completeServerAttack as never,
  });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/attack']}>
      <Routes>
        <Route path="/attack" element={<AttackScreen />} />
        <Route path="/heist" element={<div>HEIST ROUTE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('abandoning a SERVER attack shows the loss recap', () => {
  it('renders the outcome recap (not /heist) after the async settlement', async () => {
    const completeServerAttack = vi.fn().mockResolvedValue(serverPayload);
    seedServerAttack(completeServerAttack);
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /Abandon attack/i }));

    await waitFor(() => expect(completeServerAttack).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Attack abandoned')).toBeInTheDocument();
    expect(screen.getByText('STAKE FORFEITED').parentElement).toHaveTextContent('-31 TK');

    // Crucially: it did NOT auto-navigate to the heist screen.
    expect(screen.queryByText('HEIST ROUTE')).not.toBeInTheDocument();

    // Logged to History as a loss.
    const history = useGameStore.getState().attackHistory;
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(false);
    expect(history[0].stakePaid).toBe(31);
  });

  it('does NOT navigate to /heist if back is pressed again while settling', async () => {
    // A deferred settlement keeps the screen in the async 'settling'
    // phase so we can press back mid-flight — the old guard bailed to
    // /heist here and skipped the recap.
    let resolveSettle: (v: unknown) => void = () => {};
    const completeServerAttack = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSettle = resolve; })
    );
    seedServerAttack(completeServerAttack);
    renderScreen();

    const back = screen.getByRole('button', { name: /Abandon attack/i });
    fireEvent.click(back);

    // We're mid-settlement (server round-trip not yet resolved).
    expect(await screen.findByText('CHECKING YOUR RUN')).toBeInTheDocument();
    expect(completeServerAttack).toHaveBeenCalledTimes(1);

    // Impatient second back-press during settling must NOT leave.
    fireEvent.click(back);
    expect(screen.queryByText('HEIST ROUTE')).not.toBeInTheDocument();
    // And it must not kick off a second settlement.
    expect(completeServerAttack).toHaveBeenCalledTimes(1);

    // Resolve the settlement → recap appears, still no navigation.
    await act(async () => { resolveSettle(serverPayload); });
    expect(await screen.findByText('Attack abandoned')).toBeInTheDocument();
    expect(screen.queryByText('HEIST ROUTE')).not.toBeInTheDocument();
  });

  it('leaves to /heist only when the recap continue button is pressed', async () => {
    seedServerAttack(vi.fn().mockResolvedValue(serverPayload));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /Abandon attack/i }));
    await screen.findByText('Attack abandoned');
    expect(screen.queryByText('HEIST ROUTE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave heist' }));
    expect(screen.getByText('HEIST ROUTE')).toBeInTheDocument();
  });
});
