// Version-skew VOID settlement (2026-07-27 incident): when an attack's
// loadout contains a lock the shipped client can't render, submit_result
// must refund the stake and move nothing else — and that path must never
// pay loot, so it can't be abused as a breach.
//
// As in submit_result.settlement.test.ts we can't boot the Postgres
// settle_attack() RPC, so we model submit_result's decision tree over an
// in-memory ledger while using the REAL verifyAttack.

import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './_shared/verify';
import { computeLootSplit } from './_shared/attack-flow';
import { deriveLockSolution } from './_shared/lock-solutions';
import type { AttackModuleSeed } from './_shared/attack-flow';
import type { SecurityLoadout, SecurityModule } from './_shared/types';

const UNKNOWN = 'holo_maze_9000';
const ATTACKER = 'attacker-1';
const DEFENDER = 'defender-1';
const STAKE = 40;
const DEFENDER_BALANCE = 5000;

interface LedgerRow { userId: string | null; delta: number; reason: string }

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];
  status = 'pending';
  loot = 0;

  seed(u: string, n: number) { this.balances.set(u, n); }
  balance(u: string) { return this.balances.get(u) ?? 0; }
  settle(status: string, loot: number, rows: LedgerRow[]): boolean {
    if (this.status !== 'pending') return false;
    for (const e of rows) {
      this.ledger.push(e);
      if (e.userId !== null) this.balances.set(e.userId, (this.balances.get(e.userId) ?? 0) + e.delta);
    }
    this.status = status;
    this.loot = loot;
    return true;
  }
}

const mod = (type: string): SecurityModule => ({
  id: `m-${type}`, type: type as SecurityModule['type'], difficulty: 0.5, weight: 1, name: type, description: type,
});
const seedFor = (index: number, moduleType: string): AttackModuleSeed => ({
  index, moduleType, difficulty: 0.5, seed: `s${index}`,
});

/** The decision tree from submit_result/index.ts, void branch included. */
function submitResult(db: MockDb, loadout: SecurityLoadout, seeds: AttackModuleSeed[], submitted: SubmittedResultV[]) {
  const verified = verifyAttack('atk', loadout, seeds, submitted);
  if (!verified.ok) throw new Error(verified.error);

  // VOID branch: unrenderable lock → refund the stake, nothing else.
  if (verified.unsupportedCount > 0) {
    db.settle('abandoned', 0, [{ userId: ATTACKER, delta: STAKE, reason: 'attack_void_refund' }]);
    return { status: 'voided' as const, loot: 0, stakeRefunded: STAKE, verified };
  }

  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } = computeLootSplit(DEFENDER_BALANCE);
  const clientWon = verified.allPassed && verified.submittedCount === loadout.modules.length;
  const status = clientWon && verified.verifiableCount > 0 ? 'won' : 'lost';
  if (status === 'won') {
    db.settle('won', potentialLoot, [
      { userId: ATTACKER, delta: attackerReceives, reason: 'attack_loot' },
      { userId: null, delta: platformReceives, reason: 'platform_cut' },
      { userId: DEFENDER, delta: -defenderLoses, reason: 'defense_loss' },
    ]);
  } else {
    db.settle('lost', 0, [{ userId: DEFENDER, delta: STAKE, reason: 'defense_fee' }]);
  }
  return { status, loot: status === 'won' ? potentialLoot : 0, stakeRefunded: 0, verified };
}

let db: MockDb;
beforeEach(() => {
  db = new MockDb();
  // Stake already debited at start_attack.
  db.seed(ATTACKER, 1000 - STAKE);
  db.seed(DEFENDER, DEFENDER_BALANCE);
});

describe('void settlement — the player is made whole', () => {
  it('refunds the stake and moves nothing else', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad'), mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seedFor(0, 'keypad'), seedFor(1, UNKNOWN)];
    const before = db.balance(ATTACKER);

    const out = submitResult(db, loadout, seeds, []);

    expect(out.status).toBe('voided');
    expect(out.stakeRefunded).toBe(STAKE);
    expect(db.balance(ATTACKER)).toBe(before + STAKE); // whole again
    expect(db.balance(DEFENDER)).toBe(DEFENDER_BALANCE); // untouched
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0].reason).toBe('attack_void_refund');
    // No defense fee was paid out of the void.
    expect(db.ledger.some((r) => r.reason === 'defense_fee')).toBe(false);
  });

  it('is idempotent — a second submit cannot double-refund', () => {
    const loadout: SecurityLoadout = { modules: [mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seedFor(0, UNKNOWN)];
    submitResult(db, loadout, seeds, []);
    const after = db.balance(ATTACKER);
    submitResult(db, loadout, seeds, []); // replay
    expect(db.balance(ATTACKER)).toBe(after);
  });
});

describe('void settlement — an attacker gains nothing', () => {
  it('a forged all-pass over an unrenderable lock pays ZERO loot', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad'), mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seedFor(0, 'keypad'), seedFor(1, UNKNOWN)];
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 1, passed: true, timeSpent: 9000, answer: '12345678' },
      { moduleIndex: 1, moduleType: UNKNOWN, score: 1, passed: true, timeSpent: 9000 },
    ];

    const out = submitResult(db, loadout, seeds, submitted);

    expect(out.status).toBe('voided');
    expect(out.loot).toBe(0);
    expect(db.loot).toBe(0);
    // The defender lost nothing; no loot ledger rows exist at all.
    expect(db.balance(DEFENDER)).toBe(DEFENDER_BALANCE);
    expect(db.ledger.some((r) => r.reason === 'attack_loot')).toBe(false);
    expect(db.ledger.some((r) => r.reason === 'defense_loss')).toBe(false);
    // Strictly no better than never attacking: net token change is zero.
    expect(db.balance(ATTACKER)).toBe(1000);
  });

  it('an all-unrenderable safe still cannot be breached (verifiableCount 0 AND void)', () => {
    const loadout: SecurityLoadout = { modules: [mod(UNKNOWN), mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seedFor(0, UNKNOWN), seedFor(1, UNKNOWN)];
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: UNKNOWN, score: 1, passed: true, timeSpent: 9000 },
      { moduleIndex: 1, moduleType: UNKNOWN, score: 1, passed: true, timeSpent: 9000 },
    ];
    const out = submitResult(db, loadout, seeds, submitted);
    expect(out.status).toBe('voided');
    expect(out.verified.ok && out.verified.allPassed).toBe(false);
    expect(db.loot).toBe(0);
    expect(db.balance(DEFENDER)).toBe(DEFENDER_BALANCE);
  });

  it('a legitimate win on a fully supported safe is unaffected by the void branch', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad')], effectiveScore: 0 };
    const seeds = [seedFor(0, 'keypad')];
    // Correct seed-derived answer.
    const submitted: SubmittedResultV[] = [
      {
        moduleIndex: 0,
        moduleType: 'keypad',
        score: 1,
        passed: true,
        timeSpent: 9000,
        answer: deriveLockSolution('keypad', 's0', 0.5).join(''),
      },
    ];
    const out = submitResult(db, loadout, seeds, submitted);
    expect(out.status).toBe('won');
    expect(out.loot).toBeGreaterThan(0);
  });
});
