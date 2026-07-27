// POST /functions/v1/start_attack
//
// Body: { defenderSafeId?: string, botDifficulty?: number }
//
//   defenderSafeId is either:
//     * a UUID from public_safe_snapshots (a real player's safe), or
//     * a `bot_<seed>` id issued by list_targets. The server
//       reconstructs the exact same bot spec from the seed —
//       guaranteed byte-identical to what the client saw when it
//       selected the target.
//
//   botDifficulty is the legacy path (no target list). Only used when
//   no defenderSafeId is provided; the server mints a random bot on
//   the spot.
//
// Response: AttackStartPayload — attackId + module seeds. The client
// plays through the games and posts to /submit_result.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  CORS_HEADERS,
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import {
  buildAttackSeeds,
  computeStake,
  computeLootSplit,
  type AttackStartPayload,
} from '../_shared/attack-flow.ts';
import { calculateSecurityScore } from '../_shared/economy.ts';
import { ECONOMY } from '../_shared/constants.ts';
import { newSeed } from '../_shared/rng.ts';
import { generateBotTarget, parseBotId } from '../_shared/bot-target.ts';
import type { SecurityLoadout } from '../_shared/types.ts';
import { SUPPORTED_MODULE_TYPES, unsupportedTypesIn } from '../_shared/roster.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: { defenderSafeId?: string; botDifficulty?: number; supportedModuleTypes?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok — will default to a mid-difficulty bot
  }

  const supabase = serviceClient();

  // Attacker + safe row.
  const { data: attackerSafe, error: attackerErr } = await supabase
    .from('safes')
    .select('id, balance')
    .eq('owner_id', userId)
    .maybeSingle();
  if (attackerErr || !attackerSafe) return errorResponse('attacker_safe_missing', 404);

  // Any pending attack? Reject stacking.
  const { count: pendingCount } = await supabase
    .from('attacks')
    .select('id', { count: 'exact', head: true })
    .eq('attacker_id', userId)
    .eq('status', 'pending');
  if ((pendingCount ?? 0) > 0) return errorResponse('attack_already_in_progress', 409);

  // Resolve target: real safe, bot id from list_targets, or legacy
  // botDifficulty (mint a fresh bot).
  let defenderSafeId: string | null = null;
  let isBotTarget = false;
  let botTarget: Record<string, unknown> | null = null;
  let defenderHandle = 'Bot';
  let defenderBalance = 0;
  let defenderLoadout: SecurityLoadout;

  const requestedId = body.defenderSafeId;
  const botSeedFromId = requestedId ? parseBotId(requestedId) : null;

  if (botSeedFromId) {
    // Bot target with a stable id issued by list_targets. Regenerate
    // the exact same bot the client displayed.
    const bot = generateBotTarget(botSeedFromId, attackerSafe.balance);
    isBotTarget = true;
    defenderLoadout = bot.loadout;
    defenderBalance = bot.balance;
    defenderHandle = bot.handle;
    botTarget = {
      id: bot.id,
      seed: bot.seed,
      handle: bot.handle,
      balance: bot.balance,
      difficulty: bot.difficulty,
    };
  } else if (requestedId) {
    // Real safe. UUID lookup.
    const { data: target, error: targetErr } = await supabase
      .from('public_safe_snapshots')
      .select('id, owner_id, balance, security_loadout, handle, last_attacked_at')
      .eq('id', requestedId)
      .maybeSingle();
    if (targetErr || !target) return errorResponse('target_not_found', 404);
    if (target.owner_id === userId) return errorResponse('cannot_attack_self', 400);

    if (target.last_attacked_at) {
      const last = new Date(target.last_attacked_at as string).getTime();
      const now = Date.now();
      if (now - last < ECONOMY.samTargetCooldown * 1000) {
        return errorResponse('target_on_cooldown', 429, {
          cooldownRemainingMs: ECONOMY.samTargetCooldown * 1000 - (now - last),
        });
      }
    }

    defenderSafeId = target.id as string;
    defenderBalance = target.balance as number;
    defenderLoadout = target.security_loadout as SecurityLoadout;
    defenderHandle = (target.handle as string) ?? 'Player';
  } else {
    // Legacy path (no target selected): mint a fresh bot. Kept for
    // API back-compat and tooling that hasn't switched to
    // list_targets. The client's normal flow always goes through
    // list_targets now.
    isBotTarget = true;
    const botSeed = newSeed('t');
    const bot = generateBotTarget(botSeed, attackerSafe.balance);
    defenderLoadout = bot.loadout;
    defenderBalance = bot.balance;
    defenderHandle = bot.handle;
    botTarget = {
      id: bot.id,
      seed: bot.seed,
      handle: bot.handle,
      balance: bot.balance,
      difficulty: bot.difficulty,
    };
  }

  // ------- Renderability guard (PRE-STAKE) ------------------------
  // Never deal a lock the attacking client cannot render. Checked
  // against BOTH the server's shipped contract and the client's own
  // declared registry (so a stale frontend is caught even when the
  // server contract has moved ahead). Refusing here means no attack
  // row and NO stake debit — the 2026-07-27 skew incident charged
  // players for locks they were never shown. This gates nothing
  // security-relevant: it only declines to start an unplayable attack.
  const clientSupported = Array.isArray(body.supportedModuleTypes) && body.supportedModuleTypes.length > 0
    ? body.supportedModuleTypes.filter((t): t is string => typeof t === 'string')
    : null;
  const renderable = clientSupported
    ? SUPPORTED_MODULE_TYPES.filter((t) => clientSupported.includes(t))
    : SUPPORTED_MODULE_TYPES;
  const unrenderable = unsupportedTypesIn(defenderLoadout, renderable);
  if (unrenderable.length > 0) {
    return errorResponse('unsupported_module_types', 409, { types: unrenderable });
  }

  // Compute stake using shared economy.
  const defenderScore = calculateSecurityScore(defenderLoadout);
  const stake = computeStake(defenderBalance, defenderScore, attackerSafe.balance);
  if (attackerSafe.balance < stake) return errorResponse('insufficient_balance', 402, { stake });

  // Reserve an attack id up front so seeds can be namespaced to it.
  const attackId = crypto.randomUUID();
  const moduleSeeds = buildAttackSeeds(attackId, defenderLoadout);
  const { potentialLoot } = computeLootSplit(defenderBalance);

  const { error: insertErr } = await supabase.from('attacks').insert({
    id: attackId,
    attacker_id: userId,
    defender_safe_id: defenderSafeId,
    is_bot_target: isBotTarget,
    bot_target: botTarget,
    stake,
    status: 'pending',
    loadout_snapshot: defenderLoadout,
    module_seeds: moduleSeeds,
  });
  if (insertErr) return errorResponse('attack_insert_failed', 500, { detail: insertErr.message });

  const { error: ledgerErr } = await supabase.rpc('insert_ledger', {
    p_user_id: userId,
    p_delta: -stake,
    p_reason: 'attack_stake',
    p_ref_type: 'attack',
    p_ref_id: attackId,
  });
  if (ledgerErr) {
    await supabase.from('attacks').delete().eq('id', attackId);
    return errorResponse('stake_debit_failed', 500, { detail: ledgerErr.message });
  }

  const payload: AttackStartPayload = {
    attackId,
    defenderHandle,
    isBotTarget,
    stake,
    potentialLoot,
    modules: moduleSeeds,
  };
  return jsonResponse(payload);
});

export { CORS_HEADERS }; // exported so tests can inspect
