// POST /functions/v1/submit_result
//
// Body: {
//   attackId: string,
//   results: Array<{ moduleIndex, moduleType, score, passed, timeSpent }>
// }
//
// Server:
//   1. Loads the attack + its seeds/loadout.
//   2. Runs plausibility checks against each submitted result.
//   3. Applies all-or-nothing model.
//   4. Writes ledger for loot/insurance/platform-cut.
//   5. Records attack_results + marks the attack as won/lost.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { checkPlausibility, type SubmittedResult } from '../_shared/plausibility.ts';
import { computeLootSplit } from '../_shared/attack-flow.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

interface SubmitBody {
  attackId: string;
  results: SubmittedResult[];
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('bad_json');
  }
  if (!body?.attackId || !Array.isArray(body.results)) {
    return errorResponse('bad_body');
  }

  const supabase = serviceClient();

  const { data: attack, error: attackErr } = await supabase
    .from('attacks')
    .select('*')
    .eq('id', body.attackId)
    .maybeSingle();
  if (attackErr || !attack) return errorResponse('attack_not_found', 404);
  if (attack.attacker_id !== userId) return errorResponse('not_your_attack', 403);
  if (attack.status !== 'pending') return errorResponse('attack_already_resolved', 409);

  const loadout: SecurityLoadout = attack.loadout_snapshot;
  const expectedModules = loadout.modules.length;
  if (body.results.length !== expectedModules) {
    return errorResponse('module_count_mismatch', 400, {
      expected: expectedModules,
      received: body.results.length,
    });
  }

  // Plausibility + all-or-nothing.
  const rows: {
    attack_id: string;
    module_index: number;
    module_type: string;
    score: number;
    passed: boolean;
    time_spent_ms: number;
  }[] = [];
  let allPassed = true;
  for (let i = 0; i < body.results.length; i++) {
    const r = body.results[i];
    if (r.moduleIndex !== i) return errorResponse('module_index_out_of_order', 400, { at: i });
    const mod = loadout.modules[i];
    if (r.moduleType !== mod.type) {
      return errorResponse('module_type_mismatch', 400, { at: i });
    }
    const verdict = checkPlausibility(r, mod.difficulty);
    if (!verdict.ok) {
      return errorResponse('implausible_result', 422, { at: i, reason: verdict.reason });
    }
    rows.push({
      attack_id: attack.id,
      module_index: i,
      module_type: mod.type,
      score: verdict.adjustedScore,
      passed: verdict.adjustedPassed,
      time_spent_ms: Math.min(180_000, Math.round(r.timeSpent)),
    });
    if (!verdict.adjustedPassed) allPassed = false;
  }

  // Determine outcome and defender balance for loot calc.
  let defenderBalance = 0;
  if (attack.is_bot_target) {
    // Bot: use the balance we recorded on the attack (jsonb has no
    // balance field for bots today; derive from the frozen snapshot).
    defenderBalance = attack.bot_target?.balance ?? 0;
    // Bot balances aren't currently persisted with the attack; fall
    // back to a reasonable value if missing.
    if (!defenderBalance) defenderBalance = 1500;
  } else if (attack.defender_safe_id) {
    const { data: def } = await supabase
      .from('safes')
      .select('balance, owner_id')
      .eq('id', attack.defender_safe_id)
      .maybeSingle();
    defenderBalance = def?.balance ?? 0;
  }

  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } =
    computeLootSplit(defenderBalance);

  const status: 'won' | 'lost' = allPassed ? 'won' : 'lost';
  const loot = status === 'won' ? potentialLoot : 0;
  const platformFee = status === 'won' ? platformReceives : 0;

  // Persist attack_results (upsert-safe on the PK).
  const { error: resultsErr } = await supabase.from('attack_results').insert(rows);
  if (resultsErr) return errorResponse('results_insert_failed', 500, { detail: resultsErr.message });

  // Ledger effects.
  if (status === 'won') {
    // Attacker earns loot minus platform cut.
    await supabase.rpc('insert_ledger', {
      p_user_id: userId,
      p_delta: attackerReceives,
      p_reason: 'attack_loot',
      p_ref_type: 'attack',
      p_ref_id: attack.id,
    });
    // Platform cut recorded with null user.
    await supabase.rpc('insert_ledger', {
      p_user_id: null,
      p_delta: platformReceives,
      p_reason: 'platform_cut',
      p_ref_type: 'attack',
      p_ref_id: attack.id,
    });
    // Real defender pays out loot (clamped at principalFloor).
    if (!attack.is_bot_target && attack.defender_safe_id) {
      const { data: def } = await supabase
        .from('safes')
        .select('balance, owner_id')
        .eq('id', attack.defender_safe_id)
        .maybeSingle();
      if (def) {
        // Note: principalFloor handling would go here. Skipped for MVP —
        // insert_ledger allows balance to underflow only if we let it;
        // safes.balance has a >= 0 check so a huge loot event will
        // fail. Cap loss to available balance.
        const cappedLoss = Math.min(defenderLoses, def.balance);
        await supabase.rpc('insert_ledger', {
          p_user_id: def.owner_id,
          p_delta: -cappedLoss,
          p_reason: 'defense_loss',
          p_ref_type: 'attack',
          p_ref_id: attack.id,
        });

        // Insurance payout if defender has an active policy.
        const { data: policy } = await supabase
          .from('insurance_policies')
          .select('*')
          .eq('owner_id', def.owner_id)
          .gt('expires_at', new Date().toISOString())
          .gt('claims_remaining', 0)
          .order('purchased_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (policy) {
          const payout = Math.min(
            Math.round(cappedLoss * policy.coverage),
            policy.max_payout
          );
          await supabase.rpc('insert_ledger', {
            p_user_id: def.owner_id,
            p_delta: payout,
            p_reason: 'insurance_payout',
            p_ref_type: 'policy',
            p_ref_id: policy.id,
          });
          await supabase
            .from('insurance_policies')
            .update({ claims_remaining: policy.claims_remaining - 1 })
            .eq('id', policy.id);
        }
      }
    }
  } else {
    // Stake was already debited on start_attack. Defender gets a
    // fee credit when the attacker was a real player attacking a
    // real safe (i.e. not attacking a bot). This is the "defense
    // fee earned" surface.
    if (!attack.is_bot_target && attack.defender_safe_id) {
      const { data: def } = await supabase
        .from('safes')
        .select('owner_id')
        .eq('id', attack.defender_safe_id)
        .maybeSingle();
      if (def) {
        await supabase.rpc('insert_ledger', {
          p_user_id: def.owner_id,
          p_delta: attack.stake,
          p_reason: 'defense_fee',
          p_ref_type: 'attack',
          p_ref_id: attack.id,
        });
      }
    } else {
      // Stake against a bot with no counterparty: platform absorbs.
      await supabase.rpc('insert_ledger', {
        p_user_id: null,
        p_delta: attack.stake,
        p_reason: 'platform_cut',
        p_ref_type: 'attack',
        p_ref_id: attack.id,
      });
    }
  }

  // Resolve.
  await supabase
    .from('attacks')
    .update({ status, loot, platform_fee: platformFee, resolved_at: new Date().toISOString() })
    .eq('id', attack.id);

  // Fetch attacker's new balance so the client can update immediately.
  const { data: newSafe } = await supabase
    .from('safes')
    .select('balance')
    .eq('owner_id', userId)
    .maybeSingle();

  return jsonResponse({
    attackId: attack.id,
    status,
    loot,
    platformFee,
    stake: attack.stake,
    newBalance: newSafe?.balance ?? null,
    modules: rows.map(r => ({
      moduleIndex: r.module_index,
      score: r.score,
      passed: r.passed,
    })),
  });
});
