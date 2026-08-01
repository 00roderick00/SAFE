/**
 * Sign-out must clear THIS DEVICE and nothing else.
 *
 * Two failure modes this guards:
 *  1. Clearing only the auth token, leaving persisted zustand state that
 *     leaks the previous account's balance/loadout/history into the next
 *     sign-in. (This is how a phantom `pacman` loadout once survived a
 *     migration.)
 *  2. "Cleaning up" by deleting server state — the account, safe,
 *     balance and history must all still be there on sign-in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PERSISTED_STORE_KEYS, resetLocalState } from './localState';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { useSocialStore } from '../store/socialStore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_SRC = readFileSync(join(here, '../screens/ProfileScreen.tsx'), 'utf8');

beforeEach(() => {
  window.localStorage.clear();
});

describe('the key list cannot drift from the stores', () => {
  it('matches the persist() name of every store', () => {
    const storeSrc = ['playerStore', 'gameStore', 'socialStore'].map((f) =>
      readFileSync(join(here, `../store/${f}.ts`), 'utf8')
    );
    const declared = storeSrc
      .map((src) => src.match(/name:\s*'(safe-[a-z-]+)'/)?.[1])
      .filter(Boolean) as string[];
    expect(new Set(declared)).toEqual(new Set(PERSISTED_STORE_KEYS));
  });
});

describe('resetLocalState clears local state', () => {
  it('removes every persisted store key', () => {
    for (const key of PERSISTED_STORE_KEYS) {
      window.localStorage.setItem(key, JSON.stringify({ state: { safeBalance: 9999 }, version: 1 }));
    }
    expect(window.localStorage.length).toBe(PERSISTED_STORE_KEYS.length);

    resetLocalState();

    for (const key of PERSISTED_STORE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBeNull();
    }
  });

  it('resets in-memory state so the current session stops showing the old account', () => {
    usePlayerStore.setState({
      safeBalance: 87_654,
      completedHeists: 12,
      successfulHeists: 5,
      onboardingCompleted: true,
      username: 'previous-player',
    });
    useGameStore.setState({
      attackHistory: [{ id: 'a' }] as never,
      defenseHistory: [{ id: 'd' }] as never,
      botSafes: [{ id: 'b' }] as never,
      targetsSource: 'server',
    });
    useSocialStore.setState({ achievements: [{ id: 'x' }] as never });

    resetLocalState();

    const player = usePlayerStore.getState();
    expect(player.safeBalance).not.toBe(87_654);
    expect(player.completedHeists).toBe(0);
    expect(player.successfulHeists).toBe(0);
    expect(player.onboardingCompleted).toBe(false);

    const game = useGameStore.getState();
    expect(game.attackHistory).toEqual([]);
    expect(game.defenseHistory).toEqual([]);
    expect(game.botSafes).toEqual([]);
    expect(game.targetsSource).toBeNull();

    expect(useSocialStore.getState().achievements).toEqual([]);
  });

  it('leaves a fresh-install default loadout, not an empty one', () => {
    // An empty loadout is the "unbreachable trap" shape; a reset device
    // must look like a genuine first run.
    resetLocalState();
    expect(usePlayerStore.getState().securityLoadout.modules.length).toBeGreaterThan(0);
  });

  it('survives storage being unavailable (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => resetLocalState()).not.toThrow();
    // In-memory reset still happened.
    expect(usePlayerStore.getState().completedHeists).toBe(0);
    spy.mockRestore();
  });
});

describe('sign-out is LOCAL ONLY — no destructive server call', () => {
  it('calls supabase.auth.signOut() and the shared reset helper', () => {
    expect(PROFILE_SRC).toContain('supabase.auth.signOut()');
    expect(PROFILE_SRC).toContain('resetLocalState()');
  });

  it('never deletes or truncates server data from the client', () => {
    // No .delete() on safes/profiles/attacks/ledger, no admin calls, no
    // RPC that could drop the account.
    expect(PROFILE_SRC).not.toMatch(/\.delete\(\)/);
    expect(PROFILE_SRC).not.toMatch(/auth\.admin/);
    expect(PROFILE_SRC).not.toMatch(/deleteUser/i);
    expect(PROFILE_SRC).not.toMatch(/from\(['"](safes|profiles|attacks|ledger)['"]\)/);
  });

  it('the reset helper itself touches no network or server module', () => {
    const helper = readFileSync(join(here, 'localState.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(helper).not.toMatch(/supabase/i);
    expect(helper).not.toMatch(/fetch\(/);
    expect(helper).not.toMatch(/\bapi\./);
  });

  it('asks for confirmation before signing out', () => {
    expect(PROFILE_SRC).toContain('confirmSignOut');
    expect(PROFILE_SRC).toMatch(/Sign out of SAFE\?/);
  });
});

describe('restart onboarding', () => {
  it('replays the intro without signing out or clearing stores', () => {
    usePlayerStore.setState({ onboardingCompleted: true, safeBalance: 4321 });
    // Mirrors handleRestartOnboarding in ProfileScreen.
    usePlayerStore.setState({ onboardingCompleted: false });
    expect(usePlayerStore.getState().onboardingCompleted).toBe(false);
    expect(usePlayerStore.getState().safeBalance).toBe(4321);
  });

  it('is wired to a control that does not call signOut', () => {
    const restart = PROFILE_SRC.slice(
      PROFILE_SRC.indexOf('handleRestartOnboarding'),
      PROFILE_SRC.indexOf('handleRestartOnboarding') + 320
    );
    expect(restart).not.toContain('signOut');
    expect(restart).toContain('onboardingCompleted: false');
  });
});
