// POST /functions/v1/submit_result
//
// Body: {
//   attackId: string,
//   results: Array<{ moduleIndex, moduleType, score, passed, timeSpent, inputTrace? }>
// }
//
// Server:
//   1. Loads the attack + its seeds/loadout.
//   2. If already resolved, returns the current state (idempotent).
//   3. VERIFIES the outcome server-side (verifyAttack): DSL modules are
//      decided by deterministic replay of the client's input trace from
//      the issued seed; non-DSL modules fall back to plausibility. The
//      client's self-reported passed/score is NOT trusted for wins.
//   4. Computes loot/royalty/insurance, then commits EVERYTHING —
//      results + ledger + plays + insurance + status — in one atomic
//      RPC (settle_attack). If the commit can't happen, we return an
//      error instead of a fake "won".

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { computeCreatorRoyalty, computeLootSplit, type AttackModuleSeed } from '../_shared/attack-flow.ts';
import { verifyAttack, type SubmittedResultV } from '../_shared/verify.ts';
import type { SecurityLoadout } from '../_shared/types.ts';

interface SubmitBody {
  attackId: string;
  results: SubmittedResultV[];
}

interface LedgerEntry {
  user_id: string | null;
  delta: number;
  reason: string;
  ref_type: string;
  ref_id: string | null;
}

// deno-lint-ignore no-explicit-any
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

  // Idempotency: already resolved? Return the current state.
  if (attack.status !== 'pending') {
    return await resolvedPayload(supabase, attack, userId);
  }

  const loadout: SecurityLoadout = attack.loadout_snapshot;
  const moduleSeeds: AttackModuleSeed[] = Array.isArray(attack.module_seeds) ? attack.module_seeds : [];
  const expectedModules = loadout.modules.length;

  if (body.results.length > expectedModules) {
    return errorResponse('too_many_results', 400, {
      expected: expectedModules,
      received: body.results.length,
    });
  }

  // ------- Server-side verification (P0.1) ------------------------
  const verified = verifyAttack(attack.id, loadout, moduleSeeds, body.results);
  if (!verified.ok) {
    const httpStatus = verified.error === 'implausible_result' ? 422 : 400;
    return errorResponse(verified.error, httpStatus, { at: verified.at, reason: verified.reason });
  }

  // Strip the internal `method`/`reason` fields — attack_results only
  // stores the 5 columns settle_attack inserts.
  const resultRows = verified.rows.map((r) => ({
    module_index: r.module_index,
    module_type: r.module_type,
    score: r.score,
    passed: r.passed,
    time_spent_ms: r.time_spent_ms,
  }));

  // Determine outcome + defender for loot math.
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

  const clientWon = verified.allPassed && verified.submittedCount === expectedModules;
  // Composition guarantee: a safe with NO server-verifiable lock cannot
  // be breached — a "win" against it would rest entirely on forgeable,
  // plausibility-only modules. Force such attacks to a loss so a
  // fabricated result can never steal from it. Real defenders are warned
  // client-side to keep >= 1 verifiable lock; bots are generated with
  // one. See PROGRESS-SECURITY.md.
  const noVerifiableLock = verified.verifiableCount === 0;
  const status: 'won' | 'lost' = clientWon && !noVerifiableLock ? 'won' : 'lost';
  const loot = status === 'won' ? potentialLoot : 0;
  const platformFee = status === 'won' ? platformReceives : 0;

  // ------- Build the atomic ledger batch --------------------------
  const ledger: LedgerEntry[] = [];
  let insurancePolicyId: string | null = null;
  let insuranceNewClaims: number | null = null;

  if (status === 'won') {
    ledger.push({ user_id: userId, delta: attackerReceives, reason: 'attack_loot', ref_type: 'attack', ref_id: attack.id });
    ledger.push({ user_id: null, delta: platformReceives, reason: 'platform_cut', ref_type: 'attack', ref_id: attack.id });
    if (!attack.is_bot_target && defenderOwnerId) {
      const cappedLoss = Math.min(defenderLoses, defenderBalance);
      ledger.push({ user_id: defenderOwnerId, delta: -cappedLoss, reason: 'defense_loss', ref_type: 'attack', ref_id: attack.id });

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
        const payout = Math.min(Math.round(cappedLoss * policy.coverage), policy.max_payout);
        if (payout > 0) {
          ledger.push({ user_id: defenderOwnerId, delta: payout, reason: 'insurance_payout', ref_type: 'policy', ref_id: policy.id });
          insurancePolicyId = policy.id;
          insuranceNewClaims = policy.claims_remaining - 1;
        }
      }
    }
  } else {
    // Loss / abandon: stake already debited at start_attack.
    if (!attack.is_bot_target && defenderOwnerId) {
      ledger.push({ user_id: defenderOwnerId, delta: attack.stake, reason: 'defense_fee', ref_type: 'attack', ref_id: attack.id });
    } else {
      ledger.push({ user_id: null, delta: attack.stake, reason: 'platform_cut', ref_type: 'attack', ref_id: attack.id });
    }
  }

  // ------- Creator royalties (Phase 3A; loss floor from P1) --------
  const customGameIds = Array.from(
    new Set(
      loadout.modules
        .map((m: { customGameId?: string }) => m.customGameId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  let royaltyPaidPerCreator = 0;
  let royaltyPaidTotal = 0;
  const playGameIds: string[] = [];
  if (customGameIds.length > 0) {
    const { data: games } = await supabase
      .from('custom_games')
      .select('id, creator_id, status')
      .in('id', customGameIds);
    const liveGames = (games ?? []).filter((g: { status: string }) => g.status === 'live');
    for (const g of liveGames) playGameIds.push((g as { id: string }).id);

    const distinctCreators = Array.from(
      new Set(liveGames.map((g: { creator_id: string }) => g.creator_id))
    );
    if (distinctCreators.length > 0) {
      const royalty = computeCreatorRoyalty({
        outcome: status,
        stake: attack.stake,
        platformReceivesOnWin: platformReceives,
        distinctCreators: distinctCreators.length,
      });
      // Don't pay the attacker a royalty on their own equipped game.
      const paidCreators = distinctCreators.filter((c) => c !== userId);
      if (royalty.perCreator > 0 && paidCreators.length > 0) {
        royaltyPaidPerCreator = royalty.perCreator;
        royaltyPaidTotal = royalty.perCreator * paidCreators.length;
        for (const creatorId of paidCreators) {
          ledger.push({ user_id: creatorId, delta: royalty.perCreator, reason: 'creator_royalty', ref_type: 'attack', ref_id: attack.id });
        }
        // Platform funds the royalty pool (keeps the ledger balanced).
        ledger.push({ user_id: null, delta: -royaltyPaidTotal, reason: 'creator_royalty', ref_type: 'attack', ref_id: attack.id });
      }
    }
  }

  // ------- Atomic commit (P0.2) -----------------------------------
  const { data: newBalance, error: settleErr } = await supabase.rpc('settle_attack', {
    p_attack_id: attack.id,
    p_status: status,
    p_loot: loot,
    p_platform_fee: platformFee,
    p_result_rows: resultRows,
    p_ledger: ledger,
    p_play_game_ids: playGameIds,
    p_insurance_policy_id: insurancePolicyId,
    p_insurance_new_claims: insuranceNewClaims,
  });
  if (settleErr) {
    // A concurrent submit resolved it first → return the resolved state.
    if (settleErr.message?.includes('attack_not_pending')) {
      const { data: fresh } = await supabase.from('attacks').select('*').eq('id', attack.id).maybeSingle();
      if (fresh) return await resolvedPayload(supabase, fresh, userId);
    }
    return errorResponse('settlement_failed', 500, { detail: settleErr.message });
  }

  return jsonResponse({
    attackId: attack.id,
    status,
    loot,
    platformFee,
    stake: attack.stake,
    newBalance: newBalance ?? null,
    modules: verified.rows.map((r) => ({
      moduleIndex: r.module_index,
      score: r.score,
      passed: r.passed,
    })),
    creatorRoyalty: {
      perCreator: royaltyPaidPerCreator,
      total: royaltyPaidTotal,
      customGameIds,
    },
    verification: {
      verifiableCount: verified.verifiableCount,
      // A client-side win was overridden to a loss because the safe had
      // no server-verifiable lock (composition guarantee).
      forcedLoss: clientWon && noVerifiableLock,
    },
    idempotent: false,
  });
});
