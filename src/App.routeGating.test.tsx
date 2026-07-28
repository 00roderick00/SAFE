/**
 * Route-level progressive disclosure (§3).
 *
 * Hiding a nav item is not gating: a tier-0 account that deep-links
 * /security (bookmark, shared link, browser back) previously got the
 * full screen. These tests deep-link every gated route at every tier
 * through the REAL App route table.
 *
 * The gating is presentation-only — see the note in App.tsx. Nothing
 * here implies a server-side capability check.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from './store/playerStore';

const sessionState = vi.hoisted(() => ({ value: { user: { id: 'u1' } } as { user: { id: string } } | null | undefined }));

vi.mock('./services/useSession', () => ({ useSession: () => sessionState.value }));
vi.mock('./services/useHydrateFromServer', () => ({ useHydrateFromServer: () => undefined }));
vi.mock('./services/api', () => ({
  api: {
    listMarketplaceGames: vi.fn().mockResolvedValue([]),
    listOwnCustomGames: vi.fn().mockResolvedValue([]),
    updateLoadout: vi.fn().mockResolvedValue(undefined),
    getSafe: vi.fn().mockResolvedValue(null),
    getProfile: vi.fn().mockResolvedValue(null),
    listTargets: vi.fn().mockResolvedValue([]),
    getAttackStats: vi.fn().mockResolvedValue({ completed: 0, won: 0 }),
  },
}));
vi.mock('./services/supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) } },
}));

import App from './App';

/** Every gated route and the tier at which it opens. */
const GATED = [
  { path: '/security', name: 'Security', unlocksAt: 1 },
  { path: '/security/pick/0', name: 'Security', unlocksAt: 1 },
  { path: '/history', name: 'History', unlocksAt: 1 },
  { path: '/insurance', name: 'Insurance', unlocksAt: 2 },
  { path: '/marketplace', name: 'Marketplace', unlocksAt: 2 },
  { path: '/custom-games', name: 'Create', unlocksAt: 3 },
] as const;

/** Completed-heist count that lands the player exactly on each tier. */
const HEISTS_FOR_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 5 };

const setTier = (tier: number) => {
  usePlayerStore.setState({
    completedHeists: HEISTS_FOR_TIER[tier],
    successfulHeists: 0,
    lastAnnouncedTier: 3, // suppress the unlock dialog; not under test here
    onboardingCompleted: true,
  });
};

const goTo = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  usePlayerStore.setState({ onboardingCompleted: true });
  sessionState.value = { user: { id: 'u1' } };
  goTo('/');
});

describe.each([0, 1, 2, 3])('deep links at tier %i', (tier) => {
  it.each(GATED)('$path', async ({ path, name, unlocksAt }) => {
    setTier(tier);
    goTo(path);
    render(<App />);

    if (tier < unlocksAt) {
      // Locked: the explainer, naming the surface and how to open it.
      const locked = await screen.findByRole('region', { name: `${name} is locked` });
      expect(locked).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: `${name} is locked` })).toBeInTheDocument();
      expect(screen.getByText(/to unlock\.$/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start a heist' })).toBeInTheDocument();
      // Progress is concrete, not just a condition.
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    } else {
      // Unlocked: the real screen renders and no lock screen appears.
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: `${name} is locked` })).not.toBeInTheDocument()
      );
    }
  });
});

describe('ungated routes are never blocked', () => {
  it.each(['/', '/heist'])('%s renders at tier 0', async (path) => {
    setTier(0);
    goTo(path);
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/is locked$/)).not.toBeInTheDocument());
  });
});

describe('grandfathered accounts are unaffected', () => {
  it.each(GATED)('$path opens for an account with server-recorded heists', async ({ path, name }) => {
    // Exactly the hydrate path: server counts raise progression.
    usePlayerStore.getState().setProgressionFromServer(12, 4);
    goTo(path);
    render(<App />);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: `${name} is locked` })).not.toBeInTheDocument()
    );
  });

  it('a first successful breach opens Create even with one completed heist', async () => {
    usePlayerStore.setState({ completedHeists: 1, successfulHeists: 1, lastAnnouncedTier: 3, onboardingCompleted: true });
    goTo('/custom-games');
    render(<App />);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Create is locked' })).not.toBeInTheDocument()
    );
  });
});

describe('the locked screen explains the specific surface', () => {
  it('names the right unlock condition per tier', async () => {
    setTier(0);
    goTo('/custom-games');
    render(<App />);
    expect(await screen.findByRole('region', { name: 'Create is locked' })).toBeInTheDocument();
    expect(screen.getByText(/Complete 5 heists/)).toBeInTheDocument();
  });

  it('shows progress toward the requirement, not just the requirement', async () => {
    setTier(1); // 1 completed heist; Insurance needs 3
    goTo('/insurance');
    render(<App />);
    expect(await screen.findByRole('region', { name: 'Insurance is locked' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 heists completed')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });
});
