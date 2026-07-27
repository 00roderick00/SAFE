/**
 * Version-skew safety, BOTH directions (2026-07-27 incident):
 *
 *  1. The player must never be penalised for a lock we failed to ship —
 *     an unrenderable module is reported so submit_result can VOID the
 *     attack and refund the stake.
 *  2. It must never become a free pass — an attacker cannot breach a
 *     safe by forcing an unrenderable module. The module is recorded as
 *     NOT passed and allPassed is false, so no loot can ever move.
 */
import { describe, it, expect } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './verify';
import { SUPPORTED_MODULE_TYPES } from './roster';
import { deriveLockSolution } from './lock-solutions';
import type { AttackModuleSeed } from './attack-flow';
import type { SecurityLoadout, SecurityModule } from './types';

const UNKNOWN = 'holo_maze_9000'; // a type no client build has

const mod = (type: string, extra: Partial<SecurityModule> = {}): SecurityModule => ({
  id: `m-${type}`,
  type: type as SecurityModule['type'],
  difficulty: 0.5,
  weight: 1,
  name: type,
  description: type,
  ...extra,
});

const seed = (index: number, moduleType: string): AttackModuleSeed => ({
  index,
  moduleType,
  difficulty: 0.5,
  seed: `s${index}`,
});

describe('unsupported module — the player is not penalised', () => {
  it('reports it as unsupported so submit_result can void + refund', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad'), mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seed(0, 'keypad'), seed(1, UNKNOWN)];
    // The player solved the lock they COULD play, and simply has no
    // result for the one that never rendered.
    const submitted: SubmittedResultV[] = [
      {
        moduleIndex: 0,
        moduleType: 'keypad',
        score: 1,
        passed: true,
        timeSpent: 8000,
        answer: deriveLockSolution('keypad', 's0', 0.5).join(''),
      },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.unsupportedCount).toBe(1);
    expect(res.unsupportedTypes).toEqual([UNKNOWN]);
    // The lock they DID beat is still credited (method 'answer').
    expect(res.rows[0].passed).toBe(true);
    expect(res.rows[0].method).toBe('answer');
    // The unrenderable one is flagged, not silently scored.
    expect(res.rows[1].method).toBe('unsupported');
    expect(res.rows[1].reason).toBe('unsupported_module_type');
  });

  it('is distinguishable from a genuine loss (which reports no unsupported modules)', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad')], effectiveScore: 0 };
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 0.2, passed: false, timeSpent: 9000, answer: '0000' },
    ];
    const res = verifyAttack('atk', loadout, [seed(0, 'keypad')], submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.unsupportedCount).toBe(0);
    expect(res.allPassed).toBe(false);
  });
});

describe('unsupported module — an attacker cannot exploit it', () => {
  it('is never a free pass: forged all-pass over an unknown module still fails', () => {
    const loadout: SecurityLoadout = { modules: [mod(UNKNOWN)], effectiveScore: 0 };
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: UNKNOWN, score: 1, passed: true, timeSpent: 20000 },
    ];
    const res = verifyAttack('atk', loadout, [seed(0, UNKNOWN)], submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The claim is ignored: the row does not pass and the attack cannot win.
    expect(res.rows[0].passed).toBe(false);
    expect(res.allPassed).toBe(false);
    // And it is flagged for void — which pays ZERO loot, so forcing this
    // state gains an attacker nothing over never having attacked.
    expect(res.unsupportedCount).toBe(1);
  });

  it('an unknown module cannot rescue an otherwise-failed attack', () => {
    const loadout: SecurityLoadout = { modules: [mod('keypad'), mod(UNKNOWN)], effectiveScore: 0 };
    const seeds = [seed(0, 'keypad'), seed(1, UNKNOWN)];
    const submitted: SubmittedResultV[] = [
      // Wrong answer on the real lock + a forged pass on the unknown one.
      { moduleIndex: 0, moduleType: 'keypad', score: 1, passed: true, timeSpent: 7000, answer: '99999999' },
      { moduleIndex: 1, moduleType: UNKNOWN, score: 1, passed: true, timeSpent: 7000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(false);
    expect(res.rows.every((r) => !r.passed)).toBe(true);
  });

  it('does not inflate verifiableCount (composition guarantee unchanged)', () => {
    const loadout: SecurityLoadout = { modules: [mod(UNKNOWN), mod('snake')], effectiveScore: 0 };
    const res = verifyAttack('atk', loadout, [seed(0, UNKNOWN), seed(1, 'snake')], []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.verifiableCount).toBe(0);
    expect(res.allPassed).toBe(false);
  });

  it('a fully supported loadout is never flagged', () => {
    const loadout: SecurityLoadout = {
      modules: SUPPORTED_MODULE_TYPES.slice(0, 3).map((t) => mod(t)),
      effectiveScore: 0,
    };
    const res = verifyAttack('atk', loadout, loadout.modules.map((m, i) => seed(i, m.type)), []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.unsupportedCount).toBe(0);
  });
});
