// Phase 3B end-to-end: DSL generate → calibrate → equip → attack →
// creator paid. Reuses the same in-memory mock as the 3A round-trip
// but the loadout module is a DSL custom game and the calibration
// uses the REAL headless interpreter (not a heuristic).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAttackSeeds,
  computeCreatorRoyalty,
  computeLootSplit,
  computeStake,
} from './_shared/attack-flow';
import { validateDsl } from './_shared/dsl';
import { calibrateDsl } from './_shared/dsl-runtime';
import { calculateSecurityScore } from './_shared/economy';
import type { SecurityLoadout } from './_shared/types';

interface LedgerRow { userId: string | null; delta: number; reason: string; refId: string }

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];
  customGames = new Map<string, {
    creator_id: string;
    status: 'live' | 'draft' | 'rejected';
    mode: 'engine_config' | 'dsl_program';
    dsl_program?: unknown;
  }>();

  seed(userId: string, initial: number) {
    this.balances.set(userId, initial);
    this.ledger.push({ userId, delta: initial, reason: 'initial_grant', refId: 'signup' });
  }
  insertLedger(userId: string | null, delta: number, reason: string, refId: string) {
    this.ledger.push({ userId, delta, reason, refId });
    if (userId !== null) this.balances.set(userId, (this.balances.get(userId) ?? 0) + delta);
  }
  balance(u: string) { return this.balances.get(u) ?? 0; }
  balanceFromLedger(u: string) {
    return this.ledger.filter((r) => r.userId === u).reduce((s, r) => s + r.delta, 0);
  }
  ledgerCount(u: string | null, reason: string, refId: string) {
    return this.ledger.filter((r) => r.userId === u && r.reason === reason && r.refId === refId).length;
  }
}

// A hand-crafted "middle-of-band" DSL — enemy chases across a
// medium board — that lands roughly in the calibration band with
// enough iterations. The exact pass/fail is probabilistic; the test
// asserts on the SHAPE of the round trip, not on the coin flip.
function stubDsl() {
  const v = validateDsl({
    version: 1,
    board: { width: 8, height: 8 },
    timeLimit: 30,
    winCondition: 'reach_goal',
    entities: [
      { id: 'p', kind: 'player', x: 0, y: 0 },
      { id: 'g', kind: 'goal', x: 7, y: 7 },
      { id: 'e', kind: 'enemy', x: 4, y: 4, movement: { type: 'chase', speed: 3 } },
    ],
  });
  if (!v.ok) throw new Error('setup');
  return v.program;
}

describe('phase 3B round-trip: DSL → calibrate → equip → attack → creator paid', () => {
  let db: MockDb;
  const attacker = 'user-attacker';
  const creator = 'user-creator';
  const defender = 'user-defender';

  beforeEach(() => {
    db = new MockDb();
    db.seed(attacker, 1000);
    db.seed(creator, 1000);
    db.seed(defender, 2000);
  });

  it('valid DSL, real calibration, royalty flows on a won attack', () => {
    const dsl = stubDsl();

    // Real calibration — actually plays the game 30 times.
    const cal = calibrateDsl(dsl, { iterations: 30, seedPrefix: 'roundtrip' });
    expect(cal.solveRate).toBeGreaterThanOrEqual(0);
    expect(cal.solveRate).toBeLessThanOrEqual(1);
    expect(cal.traces.length).toBeGreaterThan(0);

    // Persist a `live` custom_games row regardless of calibration
    // pass/fail for the purposes of this test — the point is to
    // exercise the payout path. In production only cal.passes=true
    // would set status='live' (that guard is tested in phase3.roundtrip).
    const customGameId = 'cg-dsl-1';
    db.customGames.set(customGameId, {
      creator_id: creator,
      status: 'live',
      mode: 'dsl_program',
      dsl_program: dsl,
    });

    // Defender equips the DSL game as slot 0.
    const loadout: SecurityLoadout = {
      effectiveScore: 0,
      modules: [
        {
          id: `${customGameId}-slot-0`,
          type: 'maze', // nominal
          difficulty: cal.calibratedDifficulty,
          weight: 1,
          name: 'AI DSL Game',
          description: 'test',
          customGameId,
          customConfig: { baseEngine: 'maze', config: dsl, mode: 'dsl_program' },
        },
        { id: 'm2', type: 'keypad', difficulty: 0.5, weight: 1, name: 'kp', description: '' },
      ],
    };
    loadout.effectiveScore = calculateSecurityScore(loadout);

    // start_attack side — stake debited, seeds emitted with DSL
    // config attached so the client renders the same tuned game.
    const attackId = 'atk-dsl-1';
    const stake = computeStake(db.balance(defender), calculateSecurityScore(loadout), db.balance(attacker));
    db.insertLedger(attacker, -stake, 'attack_stake', attackId);
    const seeds = buildAttackSeeds(attackId, loadout);
    expect(seeds[0].mode).toBe('dsl_program');
    expect(seeds[0].config).toEqual(dsl);
    expect(seeds[0].baseEngine).toBe('maze');

    // Submit results as if the player won.
    const { attackerReceives, platformReceives, defenderLoses } =
      computeLootSplit(db.balance(defender));
    db.insertLedger(attacker, attackerReceives, 'attack_loot', attackId);
    db.insertLedger(null, platformReceives, 'platform_cut', attackId);
    db.insertLedger(defender, -defenderLoses, 'defense_loss', attackId);

    // Royalty math + writes.
    const customIds = loadout.modules
      .map((m) => m.customGameId)
      .filter((v): v is string => typeof v === 'string');
    const distinct = Array.from(
      new Set(customIds
        .map((id) => db.customGames.get(id))
        .filter((g): g is { creator_id: string; status: string; mode: string } => Boolean(g))
        .filter((g) => g.status === 'live')
        .map((g) => g.creator_id))
    );
    expect(distinct).toEqual([creator]);
    const royalty = computeCreatorRoyalty({
      outcome: 'won',
      stake,
      platformReceivesOnWin: platformReceives,
      distinctCreators: distinct.length,
    });
    for (const c of distinct) db.insertLedger(c, royalty.perCreator, 'creator_royalty', attackId);
    db.insertLedger(null, -royalty.totalRoyalty, 'creator_royalty', attackId);

    expect(db.balance(creator)).toBe(1000 + royalty.perCreator);
    expect(db.balanceFromLedger(creator)).toBe(db.balance(creator));
    expect(db.balanceFromLedger(attacker)).toBe(db.balance(attacker));
    expect(db.balanceFromLedger(defender)).toBe(db.balance(defender));
    expect(db.ledgerCount(creator, 'creator_royalty', attackId)).toBe(1);
  });

  it('invalid DSL never becomes live, never pays royalties', () => {
    // Missing player → validator rejects. The Edge Function returns
    // dsl_invalid; no custom_games row is created; therefore no way
    // to route a royalty to this "creator" ever.
    const bad = validateDsl({
      version: 1,
      board: { width: 6, height: 6 },
      timeLimit: 30,
      winCondition: 'reach_goal',
      entities: [{ id: 'g', kind: 'goal', x: 5, y: 5 }],
    });
    expect(bad.ok).toBe(false);
  });

  it('calibration gate: unreachable board is rejected → status must not be live', () => {
    const walled = validateDsl({
      version: 1,
      board: { width: 6, height: 6 },
      timeLimit: 15,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        { id: 'w1', kind: 'wall', x: 1, y: 0 },
        { id: 'w2', kind: 'wall', x: 1, y: 1 },
        { id: 'w3', kind: 'wall', x: 1, y: 2 },
        { id: 'w4', kind: 'wall', x: 1, y: 3 },
        { id: 'w5', kind: 'wall', x: 1, y: 4 },
        { id: 'w6', kind: 'wall', x: 1, y: 5 },
      ],
    });
    if (!walled.ok) throw new Error('setup');
    const cal = calibrateDsl(walled.program, { iterations: 30 });
    expect(cal.passes).toBe(false);
    expect(cal.reason).toBe('too_hard');
  });
});
