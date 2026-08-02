// POST /functions/v1/resolve_defense
//
// REPORTS real attacks against the caller's safe. It does not adjudicate
// anything and it moves no tokens.
//
// WHAT THIS REPLACED: this endpoint used to FABRICATE attacks —
// `Math.random() > ATTACK_FIRE_CHANCE` decided whether an imaginary
// raider appeared, rolled a fake skill value against the loadout, and
// then wrote real ledger entries for the invented outcome. No genuine
// player attack ever reached it. Defence was a coin flip that minted and
// destroyed tokens.
//
// Now: the only source of truth is the `attacks` table. Outcomes are
// already settled by submit_result (server-authoritative, verified,
// atomic) — this endpoint only tells the defender what happened and what
// is happening. It performs NO writes at all.
//
// Body: { since?: string }  ISO timestamp of the client's last check.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';

/** Attacks resolved in this window are reported even without `since`. */
const DEFAULT_LOOKBACK_MS = 5 * 60 * 1000;
const MAX_ROWS = 20;

interface InFlightAttack {
  attackId: string;
  attackerHandle: string;
  startedAt: string;
  /** Whole seconds since the raid began — the only progress signal
   *  available, and cosmetic. See the note below. */
  elapsedSeconds: number;
  lockCount: number;
}

interface ResolvedAttack {
  attackId: string;
  attackerHandle: string;
  /** 'won' = the attacker breached; from the attacker's perspective,
   *  which is how the row is stored. */
  status: string;
  resolvedAt: string;
  stake: number;
  loot: number;
  /** Tokens this defender lost (0 when they held). */
  lootLost: number;
  /** Fee earned for holding (the forfeited stake). */
  feeEarned: number;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: { since?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }

  const supabase = serviceClient();

  const { data: safe, error: safeErr } = await supabase
    .from('safes')
    .select('id, balance, exposed_until')
    .eq('owner_id', userId)
    .maybeSingle();
  if (safeErr || !safe) return errorResponse('safe_not_found', 404);

  const sinceMs = body.since ? new Date(body.since).getTime() : NaN;
  const since = new Date(
    Number.isFinite(sinceMs) ? sinceMs : Date.now() - DEFAULT_LOOKBACK_MS,
  ).toISOString();

  // Everything targeting THIS safe: still running, or finished since the
  // client last looked.
  const { data: rows, error: rowsErr } = await supabase
    .from('attacks')
    .select('id, attacker_id, status, stake, loot, created_at, resolved_at, loadout_snapshot')
    .eq('defender_safe_id', safe.id)
    .or(`status.eq.pending,resolved_at.gt.${since}`)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (rowsErr) return errorResponse('defense_query_failed', 500, { detail: rowsErr.message });

  // Attacker handles (public, already shown on target cards).
  const attackerIds = [...new Set((rows ?? []).map((r) => r.attacker_id as string))];
  const handles = new Map<string, string>();
  if (attackerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, handle')
      .in('id', attackerIds);
    for (const p of profiles ?? []) handles.set(p.id as string, (p.handle as string) ?? 'Raider');
  }

  const now = Date.now();
  const inFlight: InFlightAttack[] = [];
  const resolved: ResolvedAttack[] = [];

  for (const row of rows ?? []) {
    const attackerHandle = handles.get(row.attacker_id as string) ?? 'Raider';
    if (row.status === 'pending') {
      const startedAt = row.created_at as string;
      inFlight.push({
        attackId: row.id as string,
        attackerHandle,
        startedAt,
        // COSMETIC ONLY. There is no per-lock progress channel:
        // start_attack opens the row and submit_result closes it, with
        // nothing in between. Elapsed time is honest and cannot be
        // gamed; a client-reported "lock 2 of 3" would be an untrusted
        // attacker telling us how scared to be, and it must never touch
        // settlement.
        elapsedSeconds: Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)),
        lockCount: Array.isArray((row.loadout_snapshot as { modules?: unknown[] })?.modules)
          ? ((row.loadout_snapshot as { modules: unknown[] }).modules.length)
          : 0,
      });
      continue;
    }

    // Already settled by submit_result — reported, never re-decided.
    const attackerWon = row.status === 'won';
    resolved.push({
      attackId: row.id as string,
      attackerHandle,
      status: row.status as string,
      resolvedAt: (row.resolved_at as string) ?? (row.created_at as string),
      stake: (row.stake as number) ?? 0,
      loot: (row.loot as number) ?? 0,
      lootLost: attackerWon ? ((row.loot as number) ?? 0) : 0,
      feeEarned: attackerWon ? 0 : ((row.stake as number) ?? 0),
    });
  }

  const exposedUntil = safe.exposed_until as string | null;

  return jsonResponse({
    checkedAt: new Date(now).toISOString(),
    exposed: Boolean(exposedUntil && new Date(exposedUntil).getTime() > now),
    exposedUntil,
    balance: safe.balance as number,
    inFlight,
    resolved,
  });
});
