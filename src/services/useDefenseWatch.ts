// Watches for REAL attacks against your safe while you are exposed.
//
// Polling, not Realtime: a few-second poll is simpler and carries no RLS
// questions about who may subscribe to whose rows. It runs ONLY while
// exposed and stops the moment the window closes, so there is no
// background battery drain when the player isn't at risk.
//
// This hook is presentation only. It reports what submit_result already
// settled — it never decides an outcome, never moves tokens, and its
// results can be ignored entirely without changing anyone's balance.

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, type InFlightAttack } from './api';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { buildDefenseEventFromAttack } from '../game/history';

/** How often to check while exposed. */
export const DEFENSE_POLL_MS = 5_000;

export interface DefenseWatchState {
  inFlight: InFlightAttack[];
  /** True only while the server says the window is open. */
  exposed: boolean;
}

export function useDefenseWatch(session: Session | null | undefined): DefenseWatchState {
  const heistModeActive = usePlayerStore((s) => s.heistModeActive);
  // Depend on a STABLE primitive, never the session object: hooks like
  // useSession can return a fresh object each render, and depending on
  // its identity re-runs this effect every render — which, because the
  // effect sets state, spins forever.
  const userId = session?.user?.id ?? null;
  const [inFlight, setInFlight] = useState<InFlightAttack[]>([]);
  const [exposed, setExposed] = useState(false);
  /** Attack ids already written to History — re-reporting must not
   *  duplicate a defence event. */
  const seenRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Not exposed → no polling at all.
    if (!userId || !heistModeActive) {
      // Only clear if there is something to clear, so this cannot
      // trigger a render loop.
      setInFlight((prev) => (prev.length === 0 ? prev : []));
      setExposed(false);
      return;
    }

    let cancelled = false;
    const addDefenseEvent = useGameStore.getState().addDefenseEvent;
    const addNotification = useGameStore.getState().addNotification;

    const tick = async () => {
      try {
        const result = await api.resolveDefense(sinceRef.current);
        if (cancelled) return;
        sinceRef.current = result.checkedAt;
        setExposed(result.exposed);
        setInFlight(result.inFlight);
        usePlayerStore.setState({ safeBalance: result.balance });

        for (const attack of result.resolved) {
          if (seenRef.current.has(attack.attackId)) continue;
          seenRef.current.add(attack.attackId);

          // Both sides of a fight land in History.
          addDefenseEvent(buildDefenseEventFromAttack(attack));
          const held = attack.status !== 'won';
          addNotification({
            type: held ? 'defense_success' : 'defense_fail',
            title: held ? 'Attack repelled' : 'Vault breached',
            message: held
              ? `${attack.attackerHandle} failed. You kept their ${attack.feeEarned} token stake.`
              : `${attack.attackerHandle} took ${attack.lootLost} tokens.`,
          });
        }
      } catch (error) {
        // A failed poll is not an outcome — never invent one.
        console.warn('[defense] poll failed', error);
      }
    };

    void tick();
    const id = window.setInterval(tick, DEFENSE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId, heistModeActive]);

  return { inFlight, exposed };
}
