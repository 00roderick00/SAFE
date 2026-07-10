// POST /functions/v1/resolve_defense
//
// Server-owned inbound attack against the caller's safe. The client
// ticks this while in heist mode; server decides if an attack fires,
// resolves it deterministically against the loadout, applies loot +
// insurance in the ledger, and returns the resulting DefenseEvent
// for UI display.
//
// The client cannot manipulate outcomes: the RNG (whether an attack
// fires + attacker skill) lives here, and all balance mutation is
// via ledger.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { computeLootSplit } from '../_shared/attack-flow.ts';
import { calculateAttackFee, calculateSecurityScore } from '../_shared/economy.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

// Per-tick chance an attack fires. Matches the previous client
// behaviour (5%) — moved server-side so it cannot be forced.
const ATTACK_FIRE_CHANCE = 0.05;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  // Only fire an attack sometimes.
  if (Math.random() > ATTACK_FIRE_CHANCE) {
    return jsonResponse({ attacked: false });
  }

  const supabase = serviceClient();

  const { data: safe, error: safeErr } = await supabase
    .from('safes')
    .select('id, balance, security_loadout, owner_id')
    .eq('owner_id', userId)
    .maybeSingle();
  if (safeErr || !safe) return errorResponse('safe_not_found', 404);
  if (safe.balance <= 0) return jsonResponse({ attacked: false, reason: 'empty_safe' });

  const loadout: SecurityLoadout = safe.security_loadout;
  const securityScore = calculateSecurityScore(loadout);

  // Attacker rolls a single skill value; beats a lock iff skill >
  // difficulty. All-or-nothing on locks (matches attacker-side).
  const attackerSkill = 0.3 + Math.random() * 0.5;
  const moduleResults = (loadout.modules ?? []).map((mod, i) => ({
    moduleIndex: i,
    moduleId: mod.id,
    attackerScore: Number(
      Math.min(1, attackerSkill / Math.max(0.01, mod.difficulty)).toFixed(3)
    ),
    defended: attackerSkill <= mod.difficulty,
  }));

  const attackerBreached =
    moduleResults.length > 0 && moduleResults.every((r) => !r.defended);
  const attackerName = 'ShadowBot' + Math.floor(Math.random() * 1000);
  const feeEarned = calculateAttackFee(safe.balance, securityScore);

  if (!attackerBreached) {
    // Defender held: earn the fee.
    await supabase.rpc('insert_ledger', {
      p_user_id: userId,
      p_delta: feeEarned,
      p_reason: 'defense_fee',
      p_ref_type: 'defense',
      p_ref_id: null,
    });
    return jsonResponse({
      attacked: true,
      success: true,
      attackerName,
      moduleResults,
      feeEarned,
      lootLost: 0,
      insurancePayout: 0,
      newBalance: safe.balance + feeEarned,
    });
  }

  // Breach — compute loss + insurance.
  const { defenderLoses } = computeLootSplit(safe.balance);
  const cappedLoss = Math.min(defenderLoses, safe.balance);

  await supabase.rpc('insert_ledger', {
    p_user_id: userId,
    p_delta: -cappedLoss,
    p_reason: 'defense_loss',
    p_ref_type: 'defense',
    p_ref_id: null,
  });

  let insurancePayout = 0;
  const { data: policy } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('owner_id', userId)
    .gt('expires_at', new Date().toISOString())
    .gt('claims_remaining', 0)
    .order('purchased_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (policy) {
    insurancePayout = Math.min(
      Math.round(cappedLoss * policy.coverage),
      policy.max_payout
    );
    await supabase.rpc('insert_ledger', {
      p_user_id: userId,
      p_delta: insurancePayout,
      p_reason: 'insurance_payout',
      p_ref_type: 'policy',
      p_ref_id: policy.id,
    });
    await supabase
      .from('insurance_policies')
      .update({ claims_remaining: policy.claims_remaining - 1 })
      .eq('id', policy.id);
  }

  const { data: after } = await supabase
    .from('safes')
    .select('balance')
    .eq('owner_id', userId)
    .maybeSingle();

  return jsonResponse({
    attacked: true,
    success: false,
    attackerName,
    moduleResults,
    feeEarned: 0,
    lootLost: cappedLoss,
    insurancePayout,
    newBalance: after?.balance ?? safe.balance - cappedLoss + insurancePayout,
  });
});
