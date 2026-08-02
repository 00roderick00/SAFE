/**
 * Defence foundations.
 *
 * Two fictions are being removed here and both are asserted gone:
 *  1. Exposure lived only in the browser's zustand store, so every safe
 *     was attackable at any time regardless of heist mode.
 *  2. resolve_defense FABRICATED attacks with `Math.random() >
 *     ATTACK_FIRE_CHANCE`, rolled a fake attacker skill, and wrote real
 *     ledger entries for the invented outcome.
 *
 * And one rule is protected: exiting exposure closes the door to NEW
 * attacks but never cancels a raid already in flight.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ECONOMY } from './constants';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
/** Behaviour assertions must read CODE, not the prose describing it. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');

const START_ATTACK = read('../start_attack/index.ts');
const LIST_TARGETS = read('../list_targets/index.ts');
const RESOLVE_DEFENSE = read('../resolve_defense/index.ts');
const SET_EXPOSURE = read('../set_exposure/index.ts');
const MIGRATION = read('../../migrations/20260802120000_server_enforced_exposure.sql');

const START_CODE = stripComments(START_ATTACK);
const RESOLVE_CODE = stripComments(RESOLVE_DEFENSE);
const SET_CODE = stripComments(SET_EXPOSURE);

describe('exposure is server state, not a client claim', () => {
  it('the column exists and the public view exposes it for filtering', () => {
    expect(MIGRATION).toMatch(/add column if not exists exposed_until timestamptz/);
    expect(MIGRATION).toContain('s.exposed_until');
    expect(MIGRATION).toContain('create or replace view public_safe_snapshots');
  });

  it('set_exposure derives the window from ECONOMY.heistDuration, never from the body', () => {
    expect(SET_CODE).toContain('ECONOMY.heistDuration');
    // The client may only say WHETHER it wants exposure.
    expect(SET_CODE).toMatch(/body\.exposed/);
    expect(SET_CODE).not.toMatch(/body\.(duration|exposedUntil|until|ms|seconds)/);
    expect(ECONOMY.heistDuration).toBeGreaterThan(0);
  });

  it('existing safes are not stranded: nobody starts exposed, anyone can expose', () => {
    // No backfill setting exposure on existing rows.
    expect(stripComments(MIGRATION)).not.toMatch(/update\s+safes\s+set\s+exposed_until\s*=\s*now/i);
  });
});

describe('start_attack refuses an unexposed defender BEFORE any stake moves', () => {
  it('returns 409 target_not_exposed', () => {
    expect(START_CODE).toContain('target_not_exposed');
    expect(START_CODE).toMatch(/errorResponse\('target_not_exposed',\s*409/);
  });

  it('the guard runs before the attack row is inserted and before the stake is debited', () => {
    const guardAt = START_CODE.indexOf('target_not_exposed');
    const insertAt = START_CODE.indexOf("from('attacks').insert");
    const debitAt = START_CODE.indexOf("'attack_stake'");
    expect(guardAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(debitAt).toBeGreaterThan(-1);
    expect(guardAt, 'exposure guard must precede the attack row insert').toBeLessThan(insertAt);
    expect(guardAt, 'exposure guard must precede the stake debit').toBeLessThan(debitAt);
  });

  it('treats a lapsed window as not exposed', () => {
    expect(START_CODE).toMatch(/new Date\(exposedUntil\)\.getTime\(\)\s*<=\s*Date\.now\(\)/);
  });
});

describe('list_targets lists only exposed real players; bots still backfill', () => {
  it('filters on a live exposure window', () => {
    expect(LIST_TARGETS).toMatch(/\.gt\('exposed_until',\s*nowIso\)/);
  });

  it('still backfills with bots so the list never empties', () => {
    expect(LIST_TARGETS).toContain('generateBotTarget');
    expect(LIST_TARGETS).toMatch(/const remaining = Math\.max\(0, count - realCards\.length\)/);
  });
});

describe('resolve_defense reports; it never fabricates and never adjudicates', () => {
  it('has no randomness and no fire-chance left', () => {
    expect(RESOLVE_CODE).not.toMatch(/Math\.random/);
    expect(RESOLVE_CODE).not.toMatch(/ATTACK_FIRE_CHANCE/);
    expect(RESOLVE_CODE).not.toMatch(/attackerSkill/);
  });

  it('performs NO writes: no ledger, no updates, no inserts', () => {
    expect(RESOLVE_CODE).not.toMatch(/insert_ledger/);
    expect(RESOLVE_CODE).not.toMatch(/\.insert\(/);
    expect(RESOLVE_CODE).not.toMatch(/\.update\(/);
    expect(RESOLVE_CODE).not.toMatch(/\.upsert\(/);
    expect(RESOLVE_CODE).not.toMatch(/\.delete\(/);
    expect(RESOLVE_CODE).not.toMatch(/\.rpc\(/);
  });

  it('reads outcomes from the attacks table rather than deciding them', () => {
    expect(RESOLVE_CODE).toMatch(/from\('attacks'\)/);
    expect(RESOLVE_CODE).toMatch(/eq\('defender_safe_id'/);
    // Pending (in-flight) plus anything settled since the last check.
    expect(RESOLVE_CODE).toMatch(/status\.eq\.pending/);
    expect(RESOLVE_CODE).toMatch(/resolved_at\.gt\./);
    // The verdict is read, never computed.
    expect(RESOLVE_CODE).toMatch(/row\.status === 'won'/);
  });

  it('never leaks the attacker id — only the public handle', () => {
    expect(RESOLVE_CODE).not.toMatch(/attackerId:/);
    expect(RESOLVE_CODE).toMatch(/attackerHandle/);
  });

  it('progress reporting is elapsed-time only, with no client-supplied lock index', () => {
    // A client-reported "lock 2 of 3" would be an untrusted attacker
    // telling the defender how scared to be.
    expect(RESOLVE_CODE).toMatch(/elapsedSeconds/);
    expect(RESOLVE_CODE).not.toMatch(/body\.(moduleIndex|progress|lock)/);
  });
});

describe('exit closes the door, it does not cancel', () => {
  it('set_exposure only clears the window — it never touches attack rows', () => {
    expect(SET_CODE).toMatch(/exposed_until: exposedUntil/);
    // The only attacks access is a COUNT, for honest messaging.
    expect(SET_CODE).not.toMatch(/from\('attacks'\)[\s\S]{0,200}\.update\(/);
    expect(SET_CODE).not.toMatch(/status:\s*'(abandoned|cancelled|canceled)'/);
    expect(SET_CODE).not.toMatch(/\.delete\(\)/);
    expect(SET_CODE).not.toMatch(/refund/i);
  });

  it('reports how many raids keep running so the UI can be honest', () => {
    expect(SET_CODE).toMatch(/inFlightAttacks/);
    expect(SET_CODE).toMatch(/\.eq\('status', 'pending'\)/);
  });

  it('an in-flight attack is unaffected by the window closing', () => {
    // submit_result settles on the attack row alone; it never consults
    // the defender's exposure. Closing the window therefore cannot
    // change the outcome of a raid already under way.
    const submit = stripComments(read('../submit_result/index.ts'));
    expect(submit).not.toMatch(/exposed_until/);
    expect(submit).not.toMatch(/exposed/);
  });
});

describe('the forgery guarantee is untouched', () => {
  it('submit_result still enforces the composition rule', () => {
    const submit = read('../submit_result/index.ts');
    expect(submit).toContain('verifiableCount');
    expect(submit).toMatch(/noVerifiableLock/);
  });

  it('exposure changes nothing about verification', () => {
    const verify = stripComments(read('./verify.ts'));
    expect(verify).not.toMatch(/exposed/);
  });
});
