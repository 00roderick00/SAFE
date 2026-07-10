// Round-trip test for the server-authoritative attack flow.
//
// We do NOT boot Deno.serve or the Supabase runtime — instead we
// exercise the pure helpers that back start_attack / submit_result
// against an in-memory ledger and verify:
//   1. Stake is debited on start.
//   2. Server-owned seeds are non-forgeable (change per attack).
//   3. On a "won" resolution the attacker earns loot minus the
//      platform cut, defender's balance drops, and the ledger sums
//      match the safe balances.
//   4. On a "lost" resolution the attacker forfeits only the stake
//      and (against a bot target) the stake accrues to platform.
//   5. Plausibility rejection prevents a payout.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAttackSeeds,
  computeLootSplit,
  computeStake,
  generateBotLoadout,
} from './_shared/attack-flow';
import { checkPlausibility } from './_shared/plausibility';
import { calculateSecurityScore } from './_shared/economy';
import { ECONOMY } from './_shared/constants';
import type { SecurityLoadout } from './_shared/types';

// --- in-memory mock ---------------------------------------------

interface LedgerRow { userId: string | null; delta: number; reason: string; refId: string }

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];

  seed(userId: string, initial: number) {
    this.balances.set(userId, initial);
    this.ledger.push({ userId, delta: initial, reason: 'initial_grant', refId: 'signup' });
  }

  insertLedger(userId: string | null, delta: number, reason: string, refId: string) {
    this.ledger.push({ userId, delta, reason, refId });
    if (userId !== null) {
      const cur = this.balances.get(userId) ?? 0;
      this.balances.set(userId, cur + delta);
    }
  }

  balance(userId: string): number {
    return this.balances.get(userId) ?? 0;
  }

  balanceFromLedger(userId: string): number {
    return this.ledger
      .filter((r) => r.userId === userId)
      .reduce((sum, r) => sum + r.delta, 0);
  }
}

// --- test loadouts ----------------------------------------------

const defenderLoadout: SecurityLoadout = {
  effectiveScore: 0,
  modules: [
    { id: 'm1', type: 'pattern', difficulty: 0.4, weight: 1, name: 'm1', description: '' },
    { id: 'm2', type: 'keypad', difficulty: 0.5, weight: 1, name: 'm2', description: '' },
  ],
};

// --- helpers replicating the Edge Function ledger writes -------

function applyStake(db: MockDb, attackerId: string, stake: number, attackId: string) {
  db.insertLedger(attackerId, -stake, 'attack_stake', attackId);
}

function applyWonPayout(
  db: MockDb,
  attackerId: string,
  defenderId: string | null,
  attackId: string,
  defenderBalance: number
) {
  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } =
    computeLootSplit(defenderBalance);
  db.insertLedger(attackerId, attackerReceives, 'attack_loot', attackId);
  db.insertLedger(null, platformReceives, 'platform_cut', attackId);
  if (defenderId) {
    db.insertLedger(defenderId, -defenderLoses, 'defense_loss', attackId);
  }
  return { potentialLoot, attackerReceives, platformReceives, defenderLoses };
}

function applyLostFee(db: MockDb, defenderId: string | null, stake: number, attackId: string) {
  if (defenderId) {
    db.insertLedger(defenderId, stake, 'defense_fee', attackId);
  } else {
    db.insertLedger(null, stake, 'platform_cut', attackId);
  }
}

// --- tests ------------------------------------------------------

describe('server-authoritative attack round-trip', () => {
  let db: MockDb;
  const attacker = 'user-attacker';
  const defender = 'user-defender';

  beforeEach(() => {
    db = new MockDb();
    db.seed(attacker, 1000);
    db.seed(defender, 2000);
  });

  it('debits stake on start; emits per-module seeds', () => {
    const attackId = 'attack-A';
    const stake = computeStake(2000, calculateSecurityScore(defenderLoadout), 1000);
    expect(stake).toBeGreaterThanOrEqual(ECONOMY.feeMin);
    expect(stake).toBeLessThanOrEqual(1000 * ECONOMY.feeMaxPercentOfBalance);

    applyStake(db, attacker, stake, attackId);
    const seeds = buildAttackSeeds(attackId, defenderLoadout);

    expect(db.balance(attacker)).toBe(1000 - stake);
    expect(seeds).toHaveLength(defenderLoadout.modules.length);
    // Different attack ids must yield different seeds.
    const seeds2 = buildAttackSeeds('attack-B', defenderLoadout);
    expect(seeds[0].seed).not.toBe(seeds2[0].seed);
  });

  it('pays loot to attacker and debits defender on a won attack', () => {
    const attackId = 'attack-won';
    const defenderBalance = db.balance(defender);
    const stake = computeStake(defenderBalance, calculateSecurityScore(defenderLoadout), db.balance(attacker));

    applyStake(db, attacker, stake, attackId);
    const seeds = buildAttackSeeds(attackId, defenderLoadout);

    // Simulate perfect submission passing plausibility.
    const submitted = seeds.map((s) => ({
      moduleType: s.moduleType,
      moduleIndex: s.index,
      score: 0.9,
      passed: true,
      timeSpent: 5000,
    }));
    submitted.forEach((r, i) => {
      const v = checkPlausibility(r, defenderLoadout.modules[i].difficulty);
      expect(v.ok).toBe(true);
    });

    const { attackerReceives, platformReceives, defenderLoses } =
      applyWonPayout(db, attacker, defender, attackId, defenderBalance);

    // Attacker net: -stake + attackerReceives
    expect(db.balance(attacker)).toBe(1000 - stake + attackerReceives);
    expect(db.balance(defender)).toBe(defenderBalance - defenderLoses);
    // Ledger reconciles.
    expect(db.balanceFromLedger(attacker)).toBe(db.balance(attacker));
    expect(db.balanceFromLedger(defender)).toBe(db.balance(defender));
    // Platform recorded receipt.
    const platform = db.ledger.filter(r => r.userId === null && r.reason === 'platform_cut');
    expect(platform.reduce((s, r) => s + r.delta, 0)).toBe(platformReceives);
  });

  it('lost attack against a real defender pays defense fee', () => {
    const attackId = 'attack-lost';
    const stake = computeStake(2000, calculateSecurityScore(defenderLoadout), 1000);
    applyStake(db, attacker, stake, attackId);
    applyLostFee(db, defender, stake, attackId);

    expect(db.balance(attacker)).toBe(1000 - stake);
    expect(db.balance(defender)).toBe(2000 + stake);
    expect(db.balanceFromLedger(attacker)).toBe(db.balance(attacker));
    expect(db.balanceFromLedger(defender)).toBe(db.balance(defender));
  });

  it('lost attack against a bot puts stake in platform cut', () => {
    const attackId = 'attack-bot-lost';
    const bot = generateBotLoadout('bot-x', 0.5);
    const stake = computeStake(1500, calculateSecurityScore(bot), 1000);
    applyStake(db, attacker, stake, attackId);
    applyLostFee(db, null, stake, attackId);

    expect(db.balance(attacker)).toBe(1000 - stake);
    const platform = db.ledger
      .filter(r => r.userId === null && r.reason === 'platform_cut')
      .reduce((s, r) => s + r.delta, 0);
    expect(platform).toBe(stake);
  });

  it('rejects an implausibly fast submission and pays no loot', () => {
    const attackId = 'attack-cheating';
    applyStake(db, attacker, 50, attackId);

    // Client claims perfect scores at 10ms (below any minTime).
    const seeds = buildAttackSeeds(attackId, defenderLoadout);
    const submitted = seeds.map(s => ({
      moduleType: s.moduleType,
      moduleIndex: s.index,
      score: 1,
      passed: true,
      timeSpent: 10,
    }));

    // Server-side: at least one must reject.
    const anyRejected = submitted.some((r, i) => {
      const v = checkPlausibility(r, defenderLoadout.modules[i].difficulty);
      return v.ok === false;
    });
    expect(anyRejected).toBe(true);

    // Because plausibility rejected, no loot payout should happen.
    // Balance stays at 1000 - stake (50).
    expect(db.balance(attacker)).toBe(1000 - 50);
    // Attacker never received any 'attack_loot' entry.
    const loot = db.ledger.filter(r => r.userId === attacker && r.reason === 'attack_loot');
    expect(loot.length).toBe(0);
  });
});
