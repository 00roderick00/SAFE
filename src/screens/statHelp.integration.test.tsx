/**
 * Every explained stat box on every screen must reveal its help on TAP,
 * and none of them may fall back to a `title` tooltip (invisible on a
 * phone). The copy asserted here comes from STAT_HELP, which is itself
 * derived from ECONOMY — see statHelp.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { STAT_HELP } from '../game/statHelp';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';

vi.mock('../services/api', () => ({
  api: {
    listMarketplaceGames: vi.fn().mockResolvedValue([]),
    listOwnCustomGames: vi.fn().mockResolvedValue([]),
    updateLoadout: vi.fn().mockResolvedValue(undefined),
    getSafe: vi.fn().mockResolvedValue(null),
    listTargets: vi.fn().mockResolvedValue([]),
    getDefenseTick: vi.fn().mockResolvedValue(null),
    fetchTargetList: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../services/supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) } },
}));
vi.mock('../services/useSession', () => ({ useSession: () => ({ user: { id: 'u1' } }) }));

import { HomeScreen } from './HomeScreen';
import { SecurityScreen } from './SecurityScreen';
import { HeistScreen } from './HeistScreen';

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  // Full access so no locked screen intercepts the render.
  usePlayerStore.getState().setProgressionFromServer(12, 4);
});

const renderAt = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** Tap the info affordance for `label` and return the revealed panel. */
const reveal = (label: string) => {
  const trigger = screen.getByRole('button', { name: `What is ${label}?` });
  expect(trigger, `${label} help must be a tappable button`).not.toBeDisabled();
  expect(trigger, `${label} must not use a title tooltip`).not.toHaveAttribute('title');
  // Nothing is revealed before the tap.
  expect(screen.queryByRole('note', { name: `${label} explained` })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  return screen.getByRole('note', { name: `${label} explained` });
};

describe('Safe screen stat boxes', () => {
  const BOXES = [
    STAT_HELP.balance,
    STAT_HELP.potentialLoss,
    STAT_HELP.security,
    STAT_HELP.insurance,
  ];

  it.each(BOXES)('$title reveals its explanation on tap', ({ title, body }) => {
    renderAt(<HomeScreen />);
    expect(reveal(title)).toHaveTextContent(body);
  });

  it('shows no explanation panels before anything is tapped', () => {
    renderAt(<HomeScreen />);
    expect(screen.queryAllByRole('note')).toHaveLength(0);
  });
});

describe('Security screen stat boxes', () => {
  const BOXES = [
    STAT_HELP.securityStrength,
    STAT_HELP.potentialBreachLoss,
    STAT_HELP.skillCoverage,
  ];

  it.each(BOXES)('$title reveals its explanation on tap', ({ title, body }) => {
    renderAt(<SecurityScreen />);
    expect(reveal(title)).toHaveTextContent(body);
  });
});

describe('Heist target list + attack confirmation', () => {
  const TARGET = {
    id: 'bot-1',
    ownerName: 'GhostLock',
    safeBalance: 4000,
    securityScore: 40,
    securityLoadout: {
      modules: [
        { id: 'a', type: 'keypad' as const, difficulty: 0.4, weight: 1, name: 'Keypad', description: 'x' },
        { id: 'b', type: 'slider' as const, difficulty: 0.4, weight: 1, name: 'Slider', description: 'y' },
        { id: 'c', type: 'timing' as const, difficulty: 0.4, weight: 1, name: 'Timing Lock', description: 'z' },
      ],
      effectiveScore: 40,
    },
    difficultyBand: 'soft' as const,
    lootRange: 'moderate' as const,
    attackFee: 30,
    lastAttackedAt: null,
    attackCooldownUntil: null,
  };

  beforeEach(() => {
    usePlayerStore.setState({ heistModeActive: true, heistModeExpiresAt: Date.now() + 600_000, safeBalance: 1000 });
    useGameStore.setState({ botSafes: [TARGET], targetsSource: 'local', recentlyAttacked: [] });
  });

  it('the target-list legend explains Stake and Net win on tap', () => {
    renderAt(<HeistScreen />);
    expect(reveal(STAT_HELP.stake.title)).toHaveTextContent(STAT_HELP.stake.body);
    expect(reveal(STAT_HELP.netWin.title)).toHaveTextContent(STAT_HELP.netWin.body);
  });

  it('the attack confirmation explains Gross loot, Platform cut and Net win on tap', () => {
    renderAt(<HeistScreen />);
    // Any dossier card — the feed may be repopulated with generated
    // bots; the confirmation sheet is what's under test.
    const cards = screen.getAllByRole('button', { name: /stake \d+, net payout/ });
    fireEvent.click(cards[0]);

    const sheet = screen.getByRole('dialog');
    for (const { title, body } of [STAT_HELP.grossLoot, STAT_HELP.platformCut]) {
      const trigger = within(sheet).getByRole('button', { name: `What is ${title}?` });
      expect(trigger).not.toHaveAttribute('title');
      fireEvent.click(trigger);
      expect(within(sheet).getByRole('note', { name: `${title} explained` })).toHaveTextContent(body);
    }
    // Net win appears on both the win outcome and the payout line.
    expect(within(sheet).getAllByRole('button', { name: `What is ${STAT_HELP.netWin.title}?` }).length).toBeGreaterThan(0);
  });
});

describe('nothing relies on hover or title tooltips', () => {
  it('no explained stat renders a title attribute anywhere on the Safe screen', () => {
    const { container } = renderAt(<HomeScreen />);
    const titled = [...container.querySelectorAll('[title]')].map((el) => el.getAttribute('title') ?? '');
    for (const entry of Object.values(STAT_HELP)) {
      expect(titled).not.toContain(entry.body);
    }
  });

  it('help opens without any pointerenter ever firing', () => {
    renderAt(<HomeScreen />);
    const trigger = screen.getByRole('button', { name: `What is ${STAT_HELP.balance.title}?` });
    const hoverSpy = vi.fn();
    trigger.addEventListener('pointerenter', hoverSpy);
    fireEvent.click(trigger);
    expect(hoverSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('note', { name: `${STAT_HELP.balance.title} explained` })).toBeInTheDocument();
  });
});
