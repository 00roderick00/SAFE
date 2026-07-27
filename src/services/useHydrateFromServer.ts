import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, migrateLocalIfNeeded } from './api';
import { usePlayerStore } from '../store/playerStore';
import { migrateRetiredLoadout } from '../game/roster';
import { calculateSecurityScore } from '../game/economy';
import { getUnlockTier } from '../game/progression';

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

        // Progressive-disclosure ladder: derive the unlock tier from
        // the server's attack ledger. Counts only ever raise the local
        // tier (grandfathering — an account with recorded heists can
        // never regress to tier 0), and hydration-driven tier jumps are
        // marked pre-announced so returning players on a fresh device
        // aren't shown unlock fanfare for surfaces they've had for ages.
        try {
          const stats = await api.getAttackStats(userId);
          if (cancelled) return;
          const store = usePlayerStore.getState();
          store.setProgressionFromServer(stats.completed, stats.won);
          const after = usePlayerStore.getState();
          store.markTierAnnounced(
            getUnlockTier({ completedHeists: after.completedHeists, successfulHeists: after.successfulHeists }),
          );
        } catch (statsErr) {
          // eslint-disable-next-line no-console
          console.warn('[hydrate] attack-stats fetch failed', statsErr);
        }
        if (safe) {
          // Tactile-redesign migration: if the server-stored loadout
          // still holds a retired built-in, substitute its kept analog
          // and write the fix back so the safe never goes stale. All
          // retired types are class-2, so the loadout's verifiable-lock
          // count (and the forgery guarantee) is unchanged.
          let loadout = safe.security_loadout;
          const migrated = migrateRetiredLoadout(loadout);
          if (migrated.changed) {
            loadout = {
              modules: migrated.loadout.modules,
              effectiveScore: calculateSecurityScore({ modules: migrated.loadout.modules, effectiveScore: 0 }),
            };
            try {
              await api.updateLoadout(userId, loadout);
            } catch (updateErr) {
              // eslint-disable-next-line no-console
              console.warn('[hydrate] retired-loadout writeback failed', updateErr);
            }
          }
          if (cancelled) return;
          usePlayerStore.setState({
            id: userId,
            safeBalance: safe.balance,
            securityLoadout: loadout,
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
