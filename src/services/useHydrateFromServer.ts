import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, migrateLocalIfNeeded } from './api';
import { usePlayerStore } from '../store/playerStore';

/**
 * On every fresh session, hydrate the client stores from the server.
 * Runs the one-shot localStorage→DB migration for first-login users.
 */
export function useHydrateFromServer(session: Session | null) {
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    let cancelled = false;

    (async () => {
      try {
        // 1. Try to migrate any existing local state (idempotent).
        const state = usePlayerStore.getState();
        await migrateLocalIfNeeded({
          userId,
          safeBalance: state.safeBalance,
          securityLoadout: state.securityLoadout,
        });

        // 2. Hydrate the store from the server (source of truth).
        const safe = await api.getSafe(userId);
        const profile = await api.getProfile(userId);
        if (cancelled) return;
        if (safe) {
          usePlayerStore.setState({
            id: userId,
            safeBalance: safe.balance,
            securityLoadout: safe.security_loadout,
            username: profile?.handle ?? state.username,
            riskRating: profile?.mmr ?? state.riskRating,
          });
        }
      } catch (err) {
        // Non-fatal: leave the client on cached local values so the
        // UI still works. The next successful call will hydrate.
        // eslint-disable-next-line no-console
        console.warn('[hydrate] failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);
}
