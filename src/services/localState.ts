// One place that knows how to wipe this device's local state.
//
// WHY THIS EXISTS AS A SHARED HELPER: clearing only the Supabase auth
// token leaves the persisted zustand stores behind, so the next sign-in
// inherits the previous account's balance, loadout, history and unlock
// tier. That is exactly the failure mode that let a phantom `pacman`
// loadout survive a migration — stale local state masquerading as
// truth. Every caller must go through here so the list of keys can
// never drift out of sync with the stores that define them.
//
// LOCAL ONLY. Nothing in this file touches the server: the account,
// safe, balance, loadout and history all stay intact and come back on
// the next sign-in.

import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { useSocialStore } from '../store/socialStore';

/** Persisted zustand keys. Must match the `name` given to each
 *  store's persist() middleware — asserted in localState.test.ts. */
export const PERSISTED_STORE_KEYS = [
  'safe-player-storage',
  'safe-game-storage',
  'safe-social-storage',
] as const;

/**
 * Wipe every persisted store and reset the in-memory state, so the app
 * is indistinguishable from a first run on this device.
 *
 * Both halves matter: removing the localStorage entries stops stale
 * state being rehydrated on reload, and resetting the live stores stops
 * the current React tree from continuing to render the old account
 * until a reload happens.
 */
export function resetLocalState(): void {
  // ORDER MATTERS: reset the in-memory stores FIRST, then delete the
  // keys. persist() writes back on every state change, so clearing
  // storage before resetting would immediately re-persist the old
  // account and leave the very state we are trying to remove.

  // resetPlayer() also re-seeds the default loadout, which is what a
  // genuinely fresh install would have.
  usePlayerStore.getState().resetPlayer();
  usePlayerStore.setState({ onboardingCompleted: false });

  useGameStore.setState({
    botSafes: [],
    practiceSafe: null,
    attackHistory: [],
    defenseHistory: [],
    notifications: [],
    lastBotRefresh: 0,
    recentlyAttacked: [],
    targetsSource: null,
  });

  useSocialStore.setState({ achievements: [] });

  for (const key of PERSISTED_STORE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Private mode / storage disabled — the in-memory reset above
      // still applies, so carry on rather than blocking sign-out.
    }
  }
}
