// Phase 3A end-to-end: generate → calibrate → equip → attacked →
// creator paid. Uses the same in-memory ledger + attacks mock as
// attack.roundtrip.test.ts, and stubs Anthropic with a fixed valid
// config so nothing crosses the network. The real HTTP wrappers
// live in generate_game/index.ts; this test exercises the shared
// helpers they compose (validateConfig, calibrate,
// computeCreatorRoyalty) plus the submit_result payout branch.

import { describe, it, expect } from 'vitest';
import {
  buildAttackSeeds,
  computeCreatorRoyalty,
  computeLootSplit,
  computeStake,
} from './_shared/attack-flow';
import { calibrate, TARGET_BAND } from './_shared/calibration';
import { validateConfig } from './_shared/config-schemas';
import { checkPlausibility, type SubmittedResult } from './_shared/plausibility';
import { calculateSecurityScore } from './_shared/economy';
import type { SecurityLoadout } from './_shared/types';

interface LedgerRow { userId: string | null; delta: number; reason: string; refId: string }

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];
  customGames = new Map<string, { creator_id: string; status: 'live' | 'draft' | 'rejected'; plays: number }>();

  seed(userId: string, initial: number) {
    this.balances.set(userId, initial);
    this.ledger.push({ userId, delta: initial, reason: 'initial_grant', refId: 'signup' });
  }

  insertLedger(userId: string | null, delta: number, reason: string, refId: string) {
    this.ledger.push({ userId, delta, reason, refId });
    if (userId !== null) {
      this.balances.set(userId, (this.balances.get(userId) ?? 0) + delta);
    }
  }

  balance(userId: string): number { return this.balances.get(userId) ?? 0; }
  balanceFromLedger(userId: string): number {
    return this.ledger.filter((r) => r.userId === userId).reduce((s, r) => s + r.delta, 0);
  }
  ledgerCount(userId: string | null, reason: string, refId: string): number {
    return this.ledger.filter(r => r.userId === userId && r.reason === reason && r.refId === refId).length;
  }
}

describe('creator royalty math (computeCreatorRoyalty)', () => {
  it('is zero when no custom modules', () => {
    const r = computeCreatorRoyalty({
      outcome: 'won',
      stake: 100,
      platformReceivesOnWin: 40,
      distinctCreators: 0,
    });
    expect(r).toEqual({ perCreator: 0, totalRoyalty: 0 });
  });

  it('on win: 20% of platform cut, split among creators', () => {
    const r = computeCreatorRoyalty({
      outcome: 'won',
      stake: 100,
      platformReceivesOnWin: 40,
      distinctCreators: 2,
    });
    // 20% of 40 = 8; split by 2 → floor(4) = 4; total = 8.
    expect(r.perCreator).toBe(4);
    expect(r.totalRoyalty).toBe(8);
  });

  it('on loss: 2% of stake per creator', () => {
    const r = computeCreatorRoyalty({
      outcome: 'lost',
      stake: 200,
      platformReceivesOnWin: 0,
      distinctCreators: 2,
    });
    // 2% of 200 = 4 per creator; total 8.
    expect(r.perCreator).toBe(4);
    expect(r.totalRoyalty).toBe(8);
  });

  it('rounds floor per creator to avoid over-paying', () => {
    const r = computeCreatorRoyalty({
      outcome: 'won',
      stake: 100,
      platformReceivesOnWin: 43,
      distinctCreators: 3,
    });
    // 20% of 43 rounds to 9 (pool); floor(9/3) = 3 per creator;
    // total = 9. Any remainder from the floor stays on the
    // platform side.
    expect(r.perCreator).toBe(3);
    expect(r.totalRoyalty).toBe(9);
  });
});

describe('phase 3A round-trip: generate → calibrate → equip → attacked → creator paid', () => {
  it('winning attack against a live custom module pays the creator', () => {
    const db = new MockDb();
    const attacker = 'user-attacker';
    const creator = 'user-creator';
    const defender = 'user-defender';
    db.seed(attacker, 1000);
    db.seed(creator, 1000);
    db.seed(defender, 2000);

    // Step 1: Anthropic (stubbed) proposes a config.
    const rawFromAI = { gridSize: 9, timeLimit: 45, theme: 'neon' };
    const validated = validateConfig('maze', rawFromAI);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // Step 2: Server calibrates it. Must fall in the target band or
    // the game cannot be published.
    const cal = calibrate('maze', validated.config, { seed: 'phase3' });
    expect(cal.passes).toBe(true);
    expect(cal.solveRate).toBeGreaterThanOrEqual(TARGET_BAND.min);
    expect(cal.solveRate).toBeLessThanOrEqual(TARGET_BAND.max);

    // Step 3: Persist custom_games row (live).
    const customGameId = 'cg-1';
    db.customGames.set(customGameId, { creator_id: creator, status: 'live', plays: 0 });

    // Step 4: Defender equips the game as slot 0 in their loadout.
    const loadout: SecurityLoadout = {
      effectiveScore: 0,
      modules: [
        {
          id: `${customGameId}-slot-0`,
          type: 'maze',
          difficulty: cal.calibratedDifficulty,
          weight: 1,
          name: 'AI Maze',
          description: 'test',
          customGameId,
          customConfig: { baseEngine: 'maze', config: validated.config },
        },
        { id: 'm2', type: 'keypad', difficulty: 0.5, weight: 1, name: 'kp', description: '' },
      ],
    };
    loadout.effectiveScore = calculateSecurityScore(loadout);

    // Step 5: Attack fires — start_attack side.
    const attackId = 'atk-1';
    const stake = computeStake(db.balance(defender), calculateSecurityScore(loadout), db.balance(attacker));
    db.insertLedger(attacker, -stake, 'attack_stake', attackId);
    const seeds = buildAttackSeeds(attackId, loadout);
    // The custom module's seed carries baseEngine + config so the
    // client renders the same tuned game the creator built.
    expect(seeds[0].baseEngine).toBe('maze');
    expect(seeds[0].config).toEqual(validated.config);

    // Step 6: Client plays and submits N passing results.
    const submitted: SubmittedResult[] = seeds.map((s) => ({
      moduleType: s.moduleType,
      moduleIndex: s.index,
      score: 0.85,
      passed: true,
      timeSpent: 5000,
    }));
    submitted.forEach((r, i) => {
      const v = checkPlausibility(r, loadout.modules[i].difficulty);
      expect(v.ok).toBe(true);
    });

    // Step 7: submit_result applies the payout + creator royalty.
    const { attackerReceives, platformReceives, defenderLoses } =
      computeLootSplit(db.balance(defender));
    db.insertLedger(attacker, attackerReceives, 'attack_loot', attackId);
    db.insertLedger(null, platformReceives, 'platform_cut', attackId);
    db.insertLedger(defender, -defenderLoses, 'defense_loss', attackId);

    // Custom modules in the frozen snapshot → creator royalty.
    const customGameIds = loadout.modules
      .map(m => m.customGameId)
      .filter((v): v is string => typeof v === 'string');
    const distinctCreators = Array.from(new Set(
      customGameIds
        .map(id => db.customGames.get(id))
        .filter((g): g is { creator_id: string; status: string; plays: number } => Boolean(g))
        .filter(g => g.status === 'live')
        .map(g => g.creator_id)
    ));
    expect(distinctCreators).toEqual([creator]);

    const royalty = computeCreatorRoyalty({
      outcome: 'won',
      stake,
      platformReceivesOnWin: platformReceives,
      distinctCreators: distinctCreators.length,
    });
    expect(royalty.perCreator).toBeGreaterThan(0);
    for (const c of distinctCreators) {
      db.insertLedger(c, royalty.perCreator, 'creator_royalty', attackId);
    }
    db.insertLedger(null, -royalty.totalRoyalty, 'creator_royalty', attackId);

    // Assertions:
    //  - creator's balance went up by exactly royalty.perCreator.
    expect(db.balance(creator)).toBe(1000 + royalty.perCreator);
    //  - ledger reconciles (per-user sum = maintained balance).
    expect(db.balanceFromLedger(creator)).toBe(db.balance(creator));
    expect(db.balanceFromLedger(attacker)).toBe(db.balance(attacker));
    expect(db.balanceFromLedger(defender)).toBe(db.balance(defender));
    //  - platform's total is platformReceives - totalRoyalty (net).
    const platformNet = db.ledger
      .filter(r => r.userId === null && r.refId === attackId)
      .reduce((s, r) => s + r.delta, 0);
    expect(platformNet).toBe(platformReceives - royalty.totalRoyalty);
    //  - exactly one creator_royalty row per creator + one platform-side entry.
    expect(db.ledgerCount(creator, 'creator_royalty', attackId)).toBe(1);
    expect(db.ledgerCount(null, 'creator_royalty', attackId)).toBe(1);
  });

  it('rejected custom games get zero royalty even if equipped', () => {
    // Guard: if a game somehow entered a loadout while status !=
    // 'live' (e.g. it was live, then admin-flagged, then attacked),
    // the payout code path must skip it.
    const db = new MockDb();
    db.seed('attacker', 500);
    db.seed('creator', 500);

    const customGameId = 'cg-bad';
    db.customGames.set(customGameId, { creator_id: 'creator', status: 'rejected', plays: 0 });

    const customIds = ['cg-bad'];
    const live = customIds
      .map(id => db.customGames.get(id))
      .filter((g): g is { creator_id: string; status: string; plays: number } => Boolean(g))
      .filter(g => g.status === 'live');
    const distinctCreators = new Set(live.map(g => g.creator_id));

    const royalty = computeCreatorRoyalty({
      outcome: 'won',
      stake: 100,
      platformReceivesOnWin: 40,
      distinctCreators: distinctCreators.size,
    });
    expect(royalty.totalRoyalty).toBe(0);
    expect(db.balance('creator')).toBe(500); // unchanged
  });

  it('calibration gate blocks an unwinnable maze from going live', () => {
    // The creator tried to configure something impossible.
    // Expected outcome: status is 'rejected' and the game cannot
    // guard a safe (never has status='live' → royalty query skips
    // it → no way to profit from an unwinnable game).
    const cal = calibrate('maze', { gridSize: 15, timeLimit: 15 });
    expect(cal.passes).toBe(false);
    expect(cal.reason).toBe('too_hard');
  });

  it('calibration gate blocks a trivial "unlosable" maze', () => {
    const cal = calibrate('maze', { gridSize: 5, timeLimit: 90 });
    expect(cal.passes).toBe(false);
    expect(cal.reason).toBe('too_easy');
  });
});
