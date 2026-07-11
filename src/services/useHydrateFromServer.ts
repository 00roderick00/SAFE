import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, migrateLocalIfNeeded } from './api';
import { usePlayerStore } from '../store/playerStore';

/**
 * On every fresh session, hydrate the client stores from the server.
 * Runs three cleanup steps on first render for a signed-in user:
 *   1. Idempotent localStorage → DB migration (Phase 1 → Phase 2).
 *   2. Resolve any dangling `status = 'pending'` attacks for this
 *      user by submitting empty results. submit_result pads the
 *      missing modules as failed, marks the attack as `lost`, and
 *      returns the fresh balance — so we don't need a separate
 *      cancel endpoint.
 *   3. Pull the current safe row + profile as the source of truth
 *      and set them on the client store.
 */
export function useHydrateFromServer(session: Session | null) {
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    let cancelled = false;

    (async () => {
      try {
        // 1. One-shot migration from localStorage.
        const state = usePlayerStore.getState();
        await migrateLocalIfNeeded({
          userId,
          safeBalance: state.safeBalance,
          securityLoadout: state.securityLoadout,
        });

        // 2. Resolve any dangling pending attacks. Doing this BEFORE
        // hydrating the safe so the balance we read reflects the
        // post-resolution ledger.
        try {
          const pending = await api.listPendingAttacks(userId);
          for (const attack of pending) {
            if (cancelled) return;
            try {
              await api.submitResult({ attackId: attack.id, results: [] });
            } catch (submitErr) {
              // eslint-disable-next-line no-console
              console.warn('[hydrate] failed to resolve dangling attack', attack.id, submitErr);
            }
          }
        } catch (listErr) {
          // eslint-disable-next-line no-console
          console.warn('[hydrate] pending-attack cleanup failed', listErr);
        }

        // 3. Hydrate from server truth.
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
        // eslint-disable-next-line no-console
        console.warn('[hydrate] failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);
}
