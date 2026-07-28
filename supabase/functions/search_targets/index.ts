// POST /functions/v1/search_targets
//
// Find a specific player by handle and return an attackable target card.
//
// WHY AN EDGE FUNCTION: the browser must never be able to run a broad
// query over `profiles`. This endpoint uses the service client, matches
// only on handle, caps results, rate-limits per user, and returns
// exactly the fields a target card already shows. It deliberately does
// NOT return email or any user id — the only identifier that leaves the
// server is the SAFE id, which is the same opaque id list_targets
// returns and the same one start_attack expects, so a searched target
// flows through the existing confirm-and-attack path unchanged.
//
// Body: { query: string }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import {
  calculateAttackFee,
  calculateSecurityScore,
  getDifficultyBand,
  getLootRange,
} from '../_shared/economy.ts';
import { ECONOMY } from '../_shared/constants.ts';
import { countVerifiableModules } from '../_shared/lock-solutions.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

const MAX_RESULTS = 10;
/** Rate limit: searches allowed per user per rolling window. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

interface TargetCard {
  id: string;
  handle: string;
  balance: number;
  securityScore: number;
  securityLoadout: SecurityLoadout;
  difficultyBand: 'soft' | 'tricky' | 'brutal';
  lootRange: 'small' | 'moderate' | 'rich';
  attackFee: number;
  isBot: boolean;
  tagline: string | null;
  lastAttackedAt: string | null;
  /** Set when the target is still cooling down. The client shows them
   *  with the time remaining and disables attack, rather than pretending
   *  the player doesn't exist. */
  cooldownRemainingMs?: number;
  /** Set when the safe can't be attacked at all (no server-verifiable
   *  lock — it would be force-lost by the composition rule). */
  unattackableReason?: 'no_verifiable_lock';
}

/** Escape PostgREST `like` wildcards so a query can't widen the match. */
function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// deno-lint-ignore no-explicit-any
async function underRateLimit(supabase: any, userId: string): Promise<boolean> {
  const now = Date.now();
  const { data: row } = await supabase
    .from('api_rate_limits')
    .select('window_start, hits')
    .eq('user_id', userId)
    .eq('endpoint', 'search_targets')
    .maybeSingle();

  const windowStart = row?.window_start ? new Date(row.window_start).getTime() : 0;
  const fresh = now - windowStart > RATE_WINDOW_MS;
  const hits = fresh ? 0 : (row?.hits ?? 0);
  if (hits >= RATE_LIMIT) return false;

  await supabase.from('api_rate_limits').upsert(
    {
      user_id: userId,
      endpoint: 'search_targets',
      window_start: fresh ? new Date(now).toISOString() : new Date(windowStart).toISOString(),
      hits: hits + 1,
    },
    { onConflict: 'user_id,endpoint' },
  );
  return true;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    return errorResponse('bad_json');
  }

  const raw = typeof body.query === 'string' ? body.query.trim() : '';
  if (raw.length < 2) return errorResponse('query_too_short', 400, { minLength: 2 });
  const query = raw.slice(0, 40);

  const supabase = serviceClient();

  if (!(await underRateLimit(supabase, userId))) {
    return errorResponse('rate_limited', 429, { retryAfterMs: RATE_WINDOW_MS });
  }

  // Exact first, then prefix — matched on handle only, never on email.
  const { data: rows, error } = await supabase
    .from('public_safe_snapshots')
    .select('id, owner_id, balance, security_loadout, handle, last_attacked_at')
    .neq('owner_id', userId)
    .ilike('handle', `${escapeLike(query)}%`)
    .limit(MAX_RESULTS);
  if (error) return errorResponse('search_failed', 500, { detail: error.message });

  const { data: attackerSafe } = await supabase
    .from('safes')
    .select('balance')
    .eq('owner_id', userId)
    .maybeSingle();
  const attackerBalance = attackerSafe?.balance;

  const now = Date.now();
  const lower = query.toLowerCase();

  const targets: TargetCard[] = (rows ?? []).map((row) => {
    const loadout = row.security_loadout as SecurityLoadout;
    const score = calculateSecurityScore(loadout);
    const lastAttackedAt = (row.last_attacked_at as string | null) ?? null;
    const since = lastAttackedAt ? now - new Date(lastAttackedAt).getTime() : Infinity;
    const cooldownRemainingMs = since < ECONOMY.samTargetCooldown * 1000
      ? ECONOMY.samTargetCooldown * 1000 - since
      : undefined;

    const card: TargetCard = {
      // The SAFE id — same opaque identifier list_targets returns and
      // start_attack consumes. No user id is exposed.
      id: row.id as string,
      handle: (row.handle as string) ?? 'Player',
      balance: row.balance as number,
      securityScore: score,
      securityLoadout: loadout,
      difficultyBand: getDifficultyBand(score),
      lootRange: getLootRange(row.balance as number),
      attackFee: calculateAttackFee(row.balance as number, score, attackerBalance),
      isBot: false,
      tagline: null,
      lastAttackedAt,
    };
    if (cooldownRemainingMs !== undefined) card.cooldownRemainingMs = cooldownRemainingMs;
    // Same invariant list_targets enforces: a safe with no verifiable
    // lock is force-lost by the composition rule, so it must never be
    // offered as an attackable target. Surfaced (rather than hidden) so
    // searching a real player still finds them.
    if (countVerifiableModules(loadout) === 0) card.unattackableReason = 'no_verifiable_lock';
    return card;
  });

  // Exact handle match first, then alphabetical.
  targets.sort((a, b) => {
    const aExact = a.handle.toLowerCase() === lower ? 0 : 1;
    const bExact = b.handle.toLowerCase() === lower ? 0 : 1;
    return aExact - bExact || a.handle.localeCompare(b.handle);
  });

  return jsonResponse({ targets });
});
