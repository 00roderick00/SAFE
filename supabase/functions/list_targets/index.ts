// POST /functions/v1/list_targets
//
// Server-authoritative target list for the heist screen. Returns a
// mix of real player safes (from public_safe_snapshots, excluding
// self and cooldown) and deterministically-seeded bots to fill the
// list up to `count`. Every target — real or bot — carries a stable
// id that the client passes back to start_attack; the server can
// then reconstruct exactly what the user saw.
//
// Body: { count?: number }   (default 15, clamped [1, 30])

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
import { generateBotTarget, newBotId, parseBotId } from '../_shared/bot-target.ts';
import { countVerifiableModules } from '../_shared/lock-solutions.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

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
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: { count?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }
  const requested = typeof body.count === 'number' ? body.count : 15;
  const count = Math.max(1, Math.min(30, Math.floor(requested)));

  const supabase = serviceClient();

  // Real safes: everyone else with a positive balance, not on cooldown.
  const cooldownCutoff = new Date(Date.now() - ECONOMY.samTargetCooldown * 1000).toISOString();
  // Over-fetch, because the verifiable-lock filter below can drop rows
  // and we still want a full list.
  // Only REAL players who are currently exposed can be listed — you
  // cannot raid someone who isn't raiding. Bots are unaffected and keep
  // backfilling below, so the list never goes empty.
  const nowIso = new Date().toISOString();
  const { data: real, error: realErr } = await supabase
    .from('public_safe_snapshots')
    .select('id, owner_id, balance, security_loadout, handle, last_attacked_at, updated_at, exposed_until')
    .neq('owner_id', userId)
    .gt('exposed_until', nowIso)
    .or(`last_attacked_at.is.null,last_attacked_at.lt.${cooldownCutoff}`)
    .order('updated_at', { ascending: false })
    .limit(Math.min(90, count * 3));
  if (realErr) return errorResponse('list_real_failed', 500, { detail: realErr.message });

  // INVARIANT: never list a safe that cannot be breached.
  //
  // A safe with no server-verifiable lock is forced to a LOSS by the
  // composition rule in submit_result, so listing it would advertise an
  // unwinnable target that silently eats the attacker's stake. Safes are
  // now created with a starter defence (migration
  // 20260728120000_default_loadout_no_lockless_safes), so this should
  // never fire for a real player — it is the belt-and-braces half of the
  // fix, and also covers a player who deliberately equips three
  // class-2-only locks (the Security screen warns them about exactly
  // this). Bots always carry a verifiable lock by construction.
  const listable = (real ?? []).filter(
    (row) => countVerifiableModules(row.security_loadout as SecurityLoadout) > 0,
  );

  // Attacker balance for fee capping.
  const { data: attackerSafe } = await supabase
    .from('safes')
    .select('balance')
    .eq('owner_id', userId)
    .maybeSingle();
  const attackerBalance = attackerSafe?.balance;

  const realCards: TargetCard[] = listable.slice(0, count).map((row) => {
    const loadout = row.security_loadout as SecurityLoadout;
    const score = calculateSecurityScore(loadout);
    return {
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
      lastAttackedAt: (row.last_attacked_at as string | null) ?? null,
    };
  });

  // Bot backfill.
  const remaining = Math.max(0, count - realCards.length);
  const botCards: TargetCard[] = [];
  for (let i = 0; i < remaining; i++) {
    const bot = generateBotTarget(parseBotId(newBotId())!, attackerBalance);
    botCards.push({
      id: bot.id,
      handle: bot.handle,
      balance: bot.balance,
      securityScore: bot.securityScore,
      securityLoadout: bot.loadout,
      difficultyBand: bot.difficultyBand,
      lootRange: bot.lootRange,
      attackFee: bot.attackFee,
      isBot: true,
      tagline: bot.tagline,
      lastAttackedAt: null,
    });
  }

  return jsonResponse({ targets: [...realCards, ...botCards] });
});
