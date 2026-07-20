// P0.2 regression: a verified WIN must persist status + loot + royalty
// atomically; a fabricated win must persist as a LOSS with no loot.
//
// We can't boot the Postgres settle_attack() RPC here, so we model the
// submit_result decision tree with an in-memory DB whose settle() mirrors
// the RPC's all-or-nothing semantics: it applies the ledger batch, flips
// status, and bumps plays as one unit keyed on the attack still being
// pending. The verification itself uses the REAL verifyAttack.

import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './_shared/verify';
import { computeCreatorRoyalty, computeLootSplit } from './_shared/attack-flow';
import { validateDsl } from './_shared/dsl';
import type { AttackModuleSeed } from './_shared/attack-flow';
import type { SecurityLoadout } from './_shared/types';

interface LedgerRow { userId: string | null; delta: number; reason: string; refId: string }

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];
  attackStatus = 'pending';
  attackLoot = 0;
  plays = new Map<string, number>();

  seed(u: string, n: number) { this.balances.set(u, n); }
  balance(u: string) { return this.balances.get(u) ?? 0; }
  count(reason: string) { return this.ledger.filter((r) => r.reason === reason).length; }
  sumFor(u: string | null, reason: string) {
    return this.ledger.filter((r) => r.userId === u && r.reason === reason).reduce((s, r) => s + r.delta, 0);
  }

  // Mirrors settle_attack(): atomic + only when still pending.
  settle(input: {
    status: 'won' | 'lost';
    loot: number;
    ledger: LedgerRow[];
    playGameIds: string[];
  }): boolean {
    if (this.attackStatus !== 'pending') return false; // idempotent guard
    for (const e of input.ledger) {
      this.ledger.push(e);
      if (e.userId !== null) this.balances.set(e.userId, (this.balances.get(e.userId) ?? 0) + e.delta);
    }
    for (const g of input.playGameIds) this.plays.set(g, (this.plays.get(g) ?? 0) + 1);
    this.attackStatus = input.status;
    this.attackLoot = input.loot;
    return true;
  }
}

const DSL_GAME = (() => {
  const v = validateDsl({
    version: 1, board: { width: 5, height: 5 }, timeLimit: 15, winCondition: 'reach_goal',
    entities: [{ id: 'p', kind: 'player', x: 0, y: 0 }, { id: 'g', kind: 'goal', x: 2, y: 0 }],
  });
  if (!v.ok) throw new Error('setup');
  return v.program;
})();

const attacker = 'atkr';
const defender = 'defr';
const creator = 'crtr';
const attackId = 'atk-1';

function loadout(): SecurityLoadout {
  return {
    modules: [{
      id: 'g1-slot-0', type: 'maze', difficulty: 0.5, weight: 1, name: 'Warden Run', description: 'dsl',
      customGameId: 'g1', customConfig: { baseEngine: 'maze', config: DSL_GAME, mode: 'dsl_program' },
    }],
    effectiveScore: 0,
  };
}
const seeds: AttackModuleSeed[] = [
  { index: 0, moduleType: 'maze', difficulty: 0.5, seed: 's0', config: DSL_GAME, baseEngine: 'maze', mode: 'dsl_program' },
];

// The orchestration under test, mirroring submit_result/index.ts.
function runSubmit(db: MockDb, submitted: SubmittedResultV[]) {
  return runSubmitWith(db, loadout(), seeds, submitted);
}

function runSubmitWith(db: MockDb, lo: SecurityLoadout, sds: AttackModuleSeed[], submitted: SubmittedResultV[]) {
  const verified = verifyAttack(attackId, lo, sds, submitted);
  if (!verified.ok) return { error: verified.error };

  const defenderBalance = db.balance(defender);
  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } = computeLootSplit(defenderBalance);
  const clientWon = verified.allPassed && verified.submittedCount === lo.modules.length;
  // Composition guarantee (mirrors submit_result): a safe with no
  // server-verifiable lock can never be a win, regardless of client claim.
  const noVerifiableLock = verified.verifiableCount === 0;
  const status: 'won' | 'lost' = clientWon && !noVerifiableLock ? 'won' : 'lost';
  const loot = status === 'won' ? potentialLoot : 0;

  const ledger: LedgerRow[] = [];
  if (status === 'won') {
    ledger.push({ userId: attacker, delta: attackerReceives, reason: 'attack_loot', refId: attackId });
    ledger.push({ userId: null, delta: platformReceives, reason: 'platform_cut', refId: attackId });
    ledger.push({ userId: defender, delta: -Math.min(defenderLoses, defenderBalance), reason: 'defense_loss', refId: attackId });
  } else {
    ledger.push({ userId: defender, delta: 0 /* stake already debited */, reason: 'defense_fee', refId: attackId });
  }

  // Royalty (single live custom game → creator).
  const royalty = computeCreatorRoyalty({ outcome: status, stake: 20, platformReceivesOnWin: platformReceives, distinctCreators: 1 });
  if (royalty.perCreator > 0) {
    ledger.push({ userId: creator, delta: royalty.perCreator, reason: 'creator_royalty', refId: attackId });
    ledger.push({ userId: null, delta: -royalty.perCreator, reason: 'creator_royalty', refId: attackId });
  }

  const ok = db.settle({ status, loot, ledger, playGameIds: ['g1'] });
  return { status, loot, royalty, committed: ok };
}

describe('submit_result settlement (P0.2)', () => {
  let db: MockDb;
  beforeEach(() => {
    db = new MockDb();
    db.seed(attacker, 1000);
    db.seed(defender, 2000);
    db.seed(creator, 1000);
  });

  it('a fabricated win (no trace) persists as LOST with no loot', () => {
    const out = runSubmit(db, [{ moduleIndex: 0, moduleType: 'maze', score: 0.85, passed: true, timeSpent: 18000 }]);
    expect(out.status).toBe('lost');
    expect(db.attackStatus).toBe('lost');
    expect(db.count('attack_loot')).toBe(0);
    expect(db.balance(attacker)).toBe(1000); // no loot credited
  });

  it('a real win persists status + loot + royalty atomically', () => {
    const out = runSubmit(db, [{ moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: ['right', 'right'] }]);
    expect(out.status).toBe('won');
    // status flipped
    expect(db.attackStatus).toBe('won');
    expect(db.attackLoot).toBeGreaterThan(0);
    // loot credited to attacker
    expect(db.count('attack_loot')).toBe(1);
    expect(db.balance(attacker)).toBeGreaterThan(1000);
    // defender debited
    expect(db.sumFor(defender, 'defense_loss')).toBeLessThan(0);
    // royalty paid to the creator
    expect(db.sumFor(creator, 'creator_royalty')).toBeGreaterThan(0);
    expect(db.plays.get('g1')).toBe(1);
  });

  it('is idempotent: a second settle after resolution is a no-op', () => {
    runSubmit(db, [{ moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: ['right', 'right'] }]);
    const balanceAfterFirst = db.balance(attacker);
    const second = runSubmit(db, [{ moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: ['right', 'right'] }]);
    expect(second.committed).toBe(false);
    expect(db.balance(attacker)).toBe(balanceAfterFirst); // no double-pay
  });

  it('loss royalty no longer floors to zero on small stakes', () => {
    const r = computeCreatorRoyalty({ outcome: 'lost', stake: 16, platformReceivesOnWin: 0, distinctCreators: 1 });
    expect(r.perCreator).toBeGreaterThanOrEqual(1);
  });
});

describe('composition rule — a safe with no verifiable lock cannot be breached', () => {
  let db: MockDb;
  beforeEach(() => {
    db = new MockDb();
    db.seed(attacker, 1000);
    db.seed(defender, 2000);
  });

  // All-arcade safe: nothing the server can verify.
  const arcadeLoadout: SecurityLoadout = {
    effectiveScore: 0,
    modules: [
      { id: 'a', type: 'pacman', difficulty: 0.5, weight: 1, name: 'Pac-Man', description: '' },
      { id: 'b', type: 'snake', difficulty: 0.5, weight: 1, name: 'Snake', description: '' },
    ],
  };
  const arcadeSeeds: AttackModuleSeed[] = arcadeLoadout.modules.map((m, i) => ({ index: i, moduleType: m.type, difficulty: m.difficulty, seed: `s${i}` }));

  it('a plausible all-pass against an all-arcade safe is FORCED to a loss (no loot)', () => {
    // Every module passes plausibility (long enough, high score) — the
    // old code would have paid this out. With no verifiable lock it must
    // settle as a loss.
    const submitted: SubmittedResultV[] = arcadeLoadout.modules.map((m, i) => ({
      moduleIndex: i, moduleType: m.type, score: 0.95, passed: true, timeSpent: 12_000,
    }));
    const out = runSubmitWith(db, arcadeLoadout, arcadeSeeds, submitted);
    expect(out.status).toBe('lost');
    expect(db.attackStatus).toBe('lost');
    expect(db.count('attack_loot')).toBe(0);
    expect(db.balance(attacker)).toBe(1000);
    expect(db.balance(defender)).toBe(2000); // nothing stolen
  });
});
