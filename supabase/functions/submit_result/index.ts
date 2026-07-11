// POST /functions/v1/submit_result
//
// Body: {
//   attackId: string,
//   results: Array<{ moduleIndex, moduleType, score, passed, timeSpent }>
// }
//
// Server:
//   1. Loads the attack + its seeds/loadout.
//   2. If already resolved, returns the current state (idempotent —
//      the client can safely retry, double-click, or replay this
//      call from hydrate cleanup without risking a double-pay).
//   3. Runs plausibility checks against submitted results. `results`
//      may be shorter than the loadout (early exit / abandon) —
//      missing modules are recorded as failed.
//   4. Applies all-or-nothing model.
//   5. Writes ledger for loot/insurance/platform-cut.
//   6. Records attack_results + marks the attack as won/lost.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { checkPlausibility, type SubmittedResult } from '../_shared/plausibility.ts';
import { computeCreatorRoyalty, computeLootSplit } from '../_shared/attack-flow.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

interface SubmitBody {
  attackId: string;
  results: SubmittedResult[];
}

// The Supabase client type is intentionally loose here — this file is
// bundled for Deno and imports the client from esm.sh; the full type
// signature isn't available to our client tsc.
async function resolvedPayload(supabase: any, attack: any, userId: string) {
  const { data: rows } = await supabase
    .from('attack_results')
    .select('module_index, score, passed')
    .eq('attack_id', attack.id)
    .order('module_index', { ascending: true });
  const { data: newSafe } = await supabase
    .from('safes')
    .select('balance')
    .eq('owner_id', userId)
    .maybeSingle();
  return jsonResponse({
    attackId: attack.id,
    status: attack.status,
    loot: attack.loot ?? 0,
    platformFee: attack.platform_fee ?? 0,
    stake: attack.stake,
    newBalance: newSafe?.balance ?? null,
    modules: (rows ?? []).map((r: { module_index: number; score: number; passed: boolean }) => ({
      moduleIndex: r.module_index,
      score: r.score,
      passed: r.passed,
    })),
    idempotent: true,
  });
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

  // Idempotency: already resolved? Return the current state so the
  // client can update its UI. No ledger writes; no double-pay.
  if (attack.status !== 'pending') {
    return await resolvedPayload(supabase, attack, userId);
  }

  const loadout: SecurityLoadout = attack.loadout_snapshot;
  const expectedModules = loadout.modules.length;

  // Allow fewer results than expected — missing modules are treated
  // as failed (all-or-nothing means the whole attack is lost anyway).
  // This handles win (N=N), early-exit-on-fail (N<expected), and
  // full abandon (N=0).
  if (body.results.length > expectedModules) {
    return errorResponse('too_many_results', 400, {
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
  let allPassed = expectedModules > 0; // vacuously true only if there ARE modules submitted
  let submittedCount = 0;

  for (let i = 0; i < expectedModules; i++) {
    const mod = loadout.modules[i];

    if (i < body.results.length) {
      // Client-submitted result for module i.
      const r = body.results[i];
      if (r.moduleIndex !== i) return errorResponse('module_index_out_of_order', 400, { at: i });
      if (r.moduleType !== mod.type) return errorResponse('module_type_mismatch', 400, { at: i });

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
      submittedCount++;
      if (!verdict.adjustedPassed) allPassed = false;
    } else {
      // Missing result — count as a failed lock (attack abandoned or
      // ended early on a prior failure).
      rows.push({
        attack_id: attack.id,
        module_index: i,
        module_type: mod.type,
        score: 0,
        passed: false,
        time_spent_ms: 0,
      });
      allPassed = false;
    }
  }

  // If the client submitted nothing AND the loadout has zero modules
  // (edge case — shouldn't happen since start_attack requires a
  // loadout, but guard against divide-by-zero downstream), treat as
  // lost.
  if (expectedModules === 0) allPassed = false;

  // Determine outcome and defender balance for loot calc.
  let defenderBalance = 0;
  let defenderOwnerId: string | null = null;
  if (attack.is_bot_target) {
    defenderBalance = attack.bot_target?.balance ?? 0;
    if (!defenderBalance) defenderBalance = 1500;
  } else if (attack.defender_safe_id) {
    const { data: def } = await supabase
      .from('safes')
      .select('balance, owner_id')
      .eq('id', attack.defender_safe_id)
      .maybeSingle();
    defenderBalance = def?.balance ?? 0;
    defenderOwnerId = def?.owner_id ?? null;
  }

  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } =
    computeLootSplit(defenderBalance);

  const status: 'won' | 'lost' = allPassed && submittedCount === expectedModules ? 'won' : 'lost';
  const loot = status === 'won' ? potentialLoot : 0;
  const platformFee = status === 'won' ? platformReceives : 0;

  // Persist attack_results (PK on attack_id + module_index protects
  // against a same-request double insert but not against a retried
  // request racing — we guard with the status='pending' check above).
  const { error: resultsErr } = await supabase.from('attack_results').insert(rows);
  if (resultsErr) return errorResponse('results_insert_failed', 500, { detail: resultsErr.message });

  // Ledger effects.
  if (status === 'won') {
    await supabase.rpc('insert_ledger', {
      p_user_id: userId,
      p_delta: attackerReceives,
      p_reason: 'attack_loot',
      p_ref_type: 'attack',
      p_ref_id: attack.id,
    });
    await supabase.rpc('insert_ledger', {
      p_user_id: null,
      p_delta: platformReceives,
      p_reason: 'platform_cut',
      p_ref_type: 'attack',
      p_ref_id: attack.id,
    });
    if (!attack.is_bot_target && defenderOwnerId) {
      const cappedLoss = Math.min(defenderLoses, defenderBalance);
      await supabase.rpc('insert_ledger', {
        p_user_id: defenderOwnerId,
        p_delta: -cappedLoss,
        p_reason: 'defense_loss',
        p_ref_type: 'attack',
        p_ref_id: attack.id,
      });

      // Insurance payout if defender has an active policy.
      const { data: policy } = await supabase
        .from('insurance_policies')
        .select('*')
        .eq('owner_id', defenderOwnerId)
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
          p_user_id: defenderOwnerId,
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
  } else {
    // Loss / abandon: stake was already debited at start_attack.
    // Defender gets a fee credit iff attack was against a real player.
    if (!attack.is_bot_target && defenderOwnerId) {
      await supabase.rpc('insert_ledger', {
        p_user_id: defenderOwnerId,
        p_delta: attack.stake,
        p_reason: 'defense_fee',
        p_ref_type: 'attack',
        p_ref_id: attack.id,
      });
    } else {
      await supabase.rpc('insert_ledger', {
        p_user_id: null,
        p_delta: attack.stake,
        p_reason: 'platform_cut',
        p_ref_type: 'attack',
        p_ref_id: attack.id,
      });
    }
  }

  // ------- Creator royalties (Phase 3A) ---------------------------
  // Any modules in the frozen loadout snapshot that were custom
  // games — identified by a `customGameId` on the module — earn
  // their creator a royalty. Paid out of the platform's slice on
  // wins, and as a fixed defense-bonus on losses. See
  // computeCreatorRoyalty for the split.
  const customGameIds = Array.from(
    new Set(
      loadout.modules
        .map((m: { customGameId?: string }) => m.customGameId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  let royaltyPaidPerCreator = 0;
  let royaltyPaidTotal = 0;
  if (customGameIds.length > 0) {
    const { data: games } = await supabase
      .from('custom_games')
      .select('id, creator_id, status')
      .in('id', customGameIds);
    // Only pay royalties for games that were live at attack time.
    const distinctCreators = Array.from(
      new Set(
        (games ?? [])
          .filter((g: { status: string }) => g.status === 'live')
          .map((g: { creator_id: string }) => g.creator_id)
      )
    );
    if (distinctCreators.length > 0) {
      const royalty = computeCreatorRoyalty({
        outcome: status,
        stake: attack.stake,
        platformReceivesOnWin: platformReceives,
        distinctCreators: distinctCreators.length,
      });
      royaltyPaidPerCreator = royalty.perCreator;
      royaltyPaidTotal = royalty.totalRoyalty;

      if (royalty.perCreator > 0) {
        for (const creatorId of distinctCreators) {
          if (creatorId === userId) continue; // don't pay attacker royalty on their own custom game
          await supabase.rpc('insert_ledger', {
            p_user_id: creatorId,
            p_delta: royalty.perCreator,
            p_reason: 'creator_royalty',
            p_ref_type: 'attack',
            p_ref_id: attack.id,
          });
        }
        // Platform books: subtract the total royalty pool. Keeps
        // the ledger balanced: on wins we already recorded a
        // positive platform_cut for platformReceives; we now
        // record a matching negative for the royalty pool. On
        // losses (bot target) the platform recorded +stake; on a
        // real-target loss the defender got the stake, so the
        // royalty comes from platform anyway.
        await supabase.rpc('insert_ledger', {
          p_user_id: null,
          p_delta: -royalty.totalRoyalty,
          p_reason: 'creator_royalty',
          p_ref_type: 'attack',
          p_ref_id: attack.id,
        });
      }
      // Bump plays counter on each involved game.
      for (const g of games ?? []) {
        if ((g as { status: string }).status === 'live') {
          await supabase
            .from('custom_games')
            // deno-lint-ignore no-explicit-any
            .update({ plays: ((g as any).plays ?? 0) + 1, updated_at: new Date().toISOString() })
            .eq('id', (g as { id: string }).id);
        }
      }
    }
  }

  // Resolve.
  await supabase
    .from('attacks')
    .update({ status, loot, platform_fee: platformFee, resolved_at: new Date().toISOString() })
    .eq('id', attack.id);

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
    creatorRoyalty: {
      perCreator: royaltyPaidPerCreator,
      total: royaltyPaidTotal,
      customGameIds,
    },
    idempotent: false,
  });
});
