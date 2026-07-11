// Round-trip test for the server-authoritative attack flow.
//
// We do NOT boot Deno.serve or the Supabase runtime — instead we
// model the Edge Function's decision tree with in-memory helpers
// (`simulateSubmitResult`) that call the same shared helpers the
// real submit_result Edge Function does. That gives us fast, hermetic
// tests of the invariants we care about:
//
//   * Stake debited on start; seeds unique per attack.
//   * Full-N pass → attacker receives loot, defender debited,
//     platform gets cut, ledger sum == cached balance.
//   * Partial submission (fail on lock 1 of N) → status='lost',
//     server pads unplayed modules, no loot.
//   * Empty submission (abandon) → status='lost', no loot.
//   * Idempotency: replaying submit_result for a resolved attack
//     returns the resolved state and writes no new ledger rows.
//   * Payload always includes newBalance matching ledger sum.
//   * Plausibility rejection (perfect scores at 10ms) prevents loot.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAttackSeeds,
  computeLootSplit,
  computeStake,
  generateBotLoadout,
  type AttackModuleSeed,
} from './_shared/attack-flow';
import { checkPlausibility, type SubmittedResult } from './_shared/plausibility';
import { calculateSecurityScore } from './_shared/economy';
import { ECONOMY } from './_shared/constants';
import type { SecurityLoadout } from './_shared/types';

// --- in-memory mock ---------------------------------------------

interface LedgerRow { userId: string | null; delta: number; reason: string; refId: string }
interface StoredAttack {
  id: string;
  attackerId: string;
  defenderId: string | null;
  isBot: boolean;
  stake: number;
  status: 'pending' | 'won' | 'lost';
  loot: number;
  platformFee: number;
  loadout: SecurityLoadout;
  seeds: AttackModuleSeed[];
  results: { moduleIndex: number; score: number; passed: boolean; timeSpent: number }[];
}

class MockDb {
  balances = new Map<string, number>();
  ledger: LedgerRow[] = [];
  attacks = new Map<string, StoredAttack>();

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

  ledgerCount(userId: string | null, reason: string, refId: string): number {
    return this.ledger.filter(r => r.userId === userId && r.reason === reason && r.refId === refId).length;
  }
}

// --- server-side simulation of start_attack + submit_result ----

interface SubmitPayload {
  attackId: string;
  status: 'won' | 'lost';
  loot: number;
  platformFee: number;
  stake: number;
  newBalance: number;
  idempotent: boolean;
}

interface SubmitError { error: string; reason?: string }

function simulateStartAttack(
  db: MockDb,
  attackId: string,
  attackerId: string,
  defenderId: string | null,
  defenderBalance: number,
  loadout: SecurityLoadout
): { stake: number; seeds: AttackModuleSeed[] } {
  const stake = computeStake(defenderBalance, calculateSecurityScore(loadout), db.balance(attackerId));
  db.insertLedger(attackerId, -stake, 'attack_stake', attackId);
  const seeds = buildAttackSeeds(attackId, loadout);
  db.attacks.set(attackId, {
    id: attackId,
    attackerId,
    defenderId,
    isBot: defenderId === null,
    stake,
    status: 'pending',
    loot: 0,
    platformFee: 0,
    loadout,
    seeds,
    results: [],
  });
  return { stake, seeds };
}

/** Mirror of supabase/functions/submit_result/index.ts logic. */
function simulateSubmitResult(
  db: MockDb,
  attackerId: string,
  attackId: string,
  results: SubmittedResult[],
  defenderBalance: number
): SubmitPayload | SubmitError {
  const attack = db.attacks.get(attackId);
  if (!attack) return { error: 'attack_not_found' };
  if (attack.attackerId !== attackerId) return { error: 'not_your_attack' };

  // Idempotent replay.
  if (attack.status !== 'pending') {
    return {
      attackId: attack.id,
      status: attack.status,
      loot: attack.loot,
      platformFee: attack.platformFee,
      stake: attack.stake,
      newBalance: db.balance(attackerId),
      idempotent: true,
    };
  }

  const expected = attack.loadout.modules.length;
  if (results.length > expected) return { error: 'too_many_results' };

  const rows: { moduleIndex: number; score: number; passed: boolean; timeSpent: number }[] = [];
  let allPassed = expected > 0;
  let submitted = 0;

  for (let i = 0; i < expected; i++) {
    const mod = attack.loadout.modules[i];
    if (i < results.length) {
      const r = results[i];
      if (r.moduleIndex !== i) return { error: 'module_index_out_of_order' };
      if (r.moduleType !== mod.type) return { error: 'module_type_mismatch' };
      const verdict = checkPlausibility(r, mod.difficulty);
      if (!verdict.ok) return { error: 'implausible_result', reason: verdict.reason };
      rows.push({ moduleIndex: i, score: verdict.adjustedScore, passed: verdict.adjustedPassed, timeSpent: r.timeSpent });
      submitted++;
      if (!verdict.adjustedPassed) allPassed = false;
    } else {
      rows.push({ moduleIndex: i, score: 0, passed: false, timeSpent: 0 });
      allPassed = false;
    }
  }

  attack.results = rows;

  const { potentialLoot, attackerReceives, platformReceives, defenderLoses } =
    computeLootSplit(defenderBalance);
  const status: 'won' | 'lost' = allPassed && submitted === expected ? 'won' : 'lost';
  const loot = status === 'won' ? potentialLoot : 0;
  const platformFee = status === 'won' ? platformReceives : 0;

  if (status === 'won') {
    db.insertLedger(attackerId, attackerReceives, 'attack_loot', attackId);
    db.insertLedger(null, platformReceives, 'platform_cut', attackId);
    if (!attack.isBot && attack.defenderId) {
      const cappedLoss = Math.min(defenderLoses, defenderBalance);
      db.insertLedger(attack.defenderId, -cappedLoss, 'defense_loss', attackId);
    }
  } else {
    if (!attack.isBot && attack.defenderId) {
      db.insertLedger(attack.defenderId, attack.stake, 'defense_fee', attackId);
    } else {
      db.insertLedger(null, attack.stake, 'platform_cut', attackId);
    }
  }

  attack.status = status;
  attack.loot = loot;
  attack.platformFee = platformFee;

  return {
    attackId: attack.id,
    status,
    loot,
    platformFee,
    stake: attack.stake,
    newBalance: db.balance(attackerId),
    idempotent: false,
  };
}

// --- test loadouts ----------------------------------------------

const defenderLoadout: SecurityLoadout = {
  effectiveScore: 0,
  modules: [
    { id: 'm1', type: 'pattern', difficulty: 0.4, weight: 1, name: 'm1', description: '' },
    { id: 'm2', type: 'keypad', difficulty: 0.5, weight: 1, name: 'm2', description: '' },
  ],
};

function passing(seeds: AttackModuleSeed[]): SubmittedResult[] {
  return seeds.map(s => ({
    moduleType: s.moduleType,
    moduleIndex: s.index,
    score: 0.9,
    passed: true,
    timeSpent: 5000,
  }));
}

// --- tests ------------------------------------------------------

describe('start_attack → submit_result round-trip', () => {
  let db: MockDb;
  const attacker = 'user-attacker';
  const defender = 'user-defender';

  beforeEach(() => {
    db = new MockDb();
    db.seed(attacker, 1000);
    db.seed(defender, 2000);
  });

  it('start debits stake and returns unique seeds per attack', () => {
    const a = simulateStartAttack(db, 'A', attacker, defender, db.balance(defender), defenderLoadout);
    expect(db.balance(attacker)).toBe(1000 - a.stake);
    expect(a.seeds).toHaveLength(defenderLoadout.modules.length);
    const b = simulateStartAttack(db, 'B', attacker, defender, db.balance(defender), defenderLoadout);
    expect(b.seeds[0].seed).not.toBe(a.seeds[0].seed);
  });

  it('WIN: full-N pass credits loot; balance in payload matches ledger', () => {
    const defBal = db.balance(defender);
    const { seeds } = simulateStartAttack(db, 'W', attacker, defender, defBal, defenderLoadout);
    const payload = simulateSubmitResult(db, attacker, 'W', passing(seeds), defBal);
    expect('error' in payload).toBe(false);
    if ('error' in payload) return;
    expect(payload.status).toBe('won');
    expect(payload.loot).toBeGreaterThan(0);
    expect(payload.newBalance).toBe(db.balance(attacker));
    expect(payload.newBalance).toBe(db.balanceFromLedger(attacker));
  });

  it('LOSS on partial submit: fail-early is accepted, marked lost, no loot', () => {
    const defBal = db.balance(defender);
    const { seeds } = simulateStartAttack(db, 'L', attacker, defender, defBal, defenderLoadout);
    // Client failed the first lock, then quit — only 1 submitted result.
    const partial: SubmittedResult[] = [{
      moduleType: seeds[0].moduleType,
      moduleIndex: 0,
      score: 0.2,
      passed: false,
      timeSpent: 3000,
    }];
    const payload = simulateSubmitResult(db, attacker, 'L', partial, defBal);
    expect('error' in payload).toBe(false);
    if ('error' in payload) return;
    expect(payload.status).toBe('lost');
    expect(payload.loot).toBe(0);
    // Defender got the defense fee, attacker's stake is gone.
    expect(db.ledgerCount(defender, 'defense_fee', 'L')).toBe(1);
    expect(db.ledgerCount(attacker, 'attack_loot', 'L')).toBe(0);
  });

  it('ABANDON: empty results resolves the attack as lost', () => {
    const defBal = db.balance(defender);
    const { stake } = simulateStartAttack(db, 'X', attacker, defender, defBal, defenderLoadout);
    const payload = simulateSubmitResult(db, attacker, 'X', [], defBal);
    expect('error' in payload).toBe(false);
    if ('error' in payload) return;
    expect(payload.status).toBe('lost');
    expect(payload.loot).toBe(0);
    // Attacker down exactly the stake; defender up exactly the stake.
    expect(db.balance(attacker)).toBe(1000 - stake);
    expect(db.balance(defender)).toBe(2000 + stake);
    // Attack row is no longer pending — hydrate cleanup will not re-fire.
    expect(db.attacks.get('X')?.status).toBe('lost');
  });

  it('IDEMPOTENT: replaying submit_result on a resolved attack does not double-pay', () => {
    const defBal = db.balance(defender);
    const { seeds } = simulateStartAttack(db, 'I', attacker, defender, defBal, defenderLoadout);
    const first = simulateSubmitResult(db, attacker, 'I', passing(seeds), defBal);
    expect('error' in first).toBe(false);
    if ('error' in first) return;
    const balanceAfterFirst = db.balance(attacker);
    const lootLedgerAfterFirst = db.ledgerCount(attacker, 'attack_loot', 'I');
    const platformLedgerAfterFirst = db.ledgerCount(null, 'platform_cut', 'I');

    // Replay (double-click, hydrate cleanup, etc.).
    const second = simulateSubmitResult(db, attacker, 'I', passing(seeds), defBal);
    expect('error' in second).toBe(false);
    if ('error' in second) return;

    expect(second.idempotent).toBe(true);
    expect(second.status).toBe(first.status);
    expect(second.loot).toBe(first.loot);
    expect(second.newBalance).toBe(balanceAfterFirst);
    // No additional ledger rows written on the replay.
    expect(db.ledgerCount(attacker, 'attack_loot', 'I')).toBe(lootLedgerAfterFirst);
    expect(db.ledgerCount(null, 'platform_cut', 'I')).toBe(platformLedgerAfterFirst);
    expect(db.balance(attacker)).toBe(balanceAfterFirst);
  });

  it('CHEATING: perfect scores in 10ms rejected; attack stays pending, no loot', () => {
    const defBal = db.balance(defender);
    const { seeds, stake } = simulateStartAttack(db, 'C', attacker, defender, defBal, defenderLoadout);
    const cheat: SubmittedResult[] = seeds.map(s => ({
      moduleType: s.moduleType,
      moduleIndex: s.index,
      score: 1,
      passed: true,
      timeSpent: 10,
    }));
    const payload = simulateSubmitResult(db, attacker, 'C', cheat, defBal);
    expect('error' in payload).toBe(true);
    if (!('error' in payload)) return;
    expect(payload.error).toBe('implausible_result');
    // Balance still just -stake; attack still pending (hydrate can retry).
    expect(db.balance(attacker)).toBe(1000 - stake);
    expect(db.attacks.get('C')?.status).toBe('pending');
    expect(db.ledgerCount(attacker, 'attack_loot', 'C')).toBe(0);
  });

  it('bot target loss: stake accrues to platform, not to a defender row', () => {
    const bot = generateBotLoadout('bot-1', 0.5);
    const botBal = 1500;
    const { stake } = simulateStartAttack(db, 'B1', attacker, null, botBal, bot);
    simulateSubmitResult(db, attacker, 'B1', [], botBal);
    expect(db.balance(attacker)).toBe(1000 - stake);
    expect(db.ledgerCount(null, 'platform_cut', 'B1')).toBe(1);
  });

  it('caps stake at feeMaxPercentOfBalance', () => {
    // Attacker has 100 tokens; server should never take more than 50%.
    db.balances.set(attacker, 100);
    const { stake } = simulateStartAttack(db, 'S', attacker, defender, 10000, defenderLoadout);
    expect(stake).toBeLessThanOrEqual(100 * ECONOMY.feeMaxPercentOfBalance);
  });
});
