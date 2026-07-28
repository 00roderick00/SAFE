/**
 * THE EMPTY-LOADOUT TRAP (live bug, 2026-07-28).
 *
 * A safe with no server-verifiable lock is forced to a LOSS by the
 * composition rule in submit_result — correctly, since nothing in it can
 * be verified. But list_targets listed those safes anyway, so a
 * defenceless-looking vault was advertised as an attractive target,
 * could never be breached, and silently ate the attacker's stake. Two of
 * seven live safes were in that state, one holding 1,096 tokens.
 *
 * INVARIANT UNDER TEST: a safe can never be simultaneously listable as a
 * target AND unbreachable. This mirrors the filter in
 * list_targets/index.ts and the starter defence installed by migration
 * 20260728120000.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countVerifiableModules } from './lock-solutions';
import { generateBotLoadout } from './attack-flow';
import { ECONOMY } from './constants';
import type { SecurityLoadout, SecurityModule } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  join(here, '../../migrations/20260728120000_default_loadout_no_lockless_safes.sql'),
  'utf8',
);
const LIST_TARGETS = readFileSync(join(here, '../list_targets/index.ts'), 'utf8');
const SEARCH_TARGETS = readFileSync(join(here, '../search_targets/index.ts'), 'utf8');

/** Assertions about behaviour must read CODE, not prose — the comments
 *  in these files legitimately discuss the very things we forbid
 *  ("does NOT return email", "not an instant breach"). */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');

const MIGRATION_CODE = stripComments(MIGRATION);
const SEARCH_CODE = stripComments(SEARCH_TARGETS);

const mod = (type: string): SecurityModule => ({
  id: `m-${type}`, type: type as SecurityModule['type'], difficulty: 0.3, weight: 1,
  name: type, description: type,
});
const loadoutOf = (...types: string[]): SecurityLoadout => ({
  modules: types.map(mod), effectiveScore: 0,
});

/** The filter list_targets applies before building cards. */
const isListable = (l: SecurityLoadout) => countVerifiableModules(l) > 0;

describe('no listed target can have zero verifiable locks', () => {
  it('an empty loadout is unbreachable, therefore never listable', () => {
    const empty: SecurityLoadout = { modules: [], effectiveScore: 0 };
    expect(countVerifiableModules(empty)).toBe(0);
    expect(isListable(empty)).toBe(false);
  });

  it('an all-class-2 loadout is unbreachable, therefore never listable', () => {
    // Every one of these is plausibility-only — a forged result can't
    // breach them, so submit_result forces the attack to a loss.
    const classTwo = loadoutOf('timing', 'pattern', 'slider');
    expect(countVerifiableModules(classTwo)).toBe(0);
    expect(isListable(classTwo)).toBe(false);
  });

  it('any loadout with a verifiable lock is listable', () => {
    for (const types of [
      ['keypad'],
      ['keypad', 'slider', 'memorymatch'],
      ['timing', 'colorcode', 'pattern'],
      ['chesspuzzle', 'timing', 'slider'],
    ]) {
      const l = loadoutOf(...types);
      expect(countVerifiableModules(l), types.join('+')).toBeGreaterThan(0);
      expect(isListable(l), types.join('+')).toBe(true);
    }
  });

  it('bots are always listable by construction', () => {
    for (let i = 0; i < 40; i++) {
      expect(isListable(generateBotLoadout(`bot-${i}`, 0.5))).toBe(true);
    }
  });
});

describe('the starter defence removes the CAUSE, not just the symptom', () => {
  it('the signup trigger gives every new safe a verifiable lock', () => {
    // Parse the default loadout out of the migration and run it through
    // the same counter submit_result uses.
    const match = MIGRATION.match(/default_security_loadout[\s\S]*?select '([\s\S]*?)'::jsonb/);
    expect(match, 'default_security_loadout not found in migration').not.toBeNull();
    const parsed = JSON.parse(match![1]) as SecurityLoadout;

    expect(parsed.modules.length).toBe(ECONOMY.maxModules);
    expect(countVerifiableModules(parsed)).toBeGreaterThan(0);
    expect(isListable(parsed)).toBe(true);
  });

  it('the trigger no longer creates lockless safes and the backfill self-verifies', () => {
    expect(MIGRATION).toContain('public.default_security_loadout()');
    expect(MIGRATION).not.toContain(`'{"modules":[],"effectiveScore":0}'::jsonb`);
    expect(MIGRATION).toContain('backfill incomplete: lockless safes remain');
  });

  it('does NOT make defenceless safes an instant breach (that would be a farm)', () => {
    // The fix must never grant a win; it only prevents the trap forming.
    expect(MIGRATION_CODE).not.toMatch(/instant|auto[_-]?win|allPassed\s*=\s*true/i);
  });
});

describe('both target endpoints enforce the invariant', () => {
  it('list_targets filters on countVerifiableModules', () => {
    expect(LIST_TARGETS).toContain('countVerifiableModules');
    expect(LIST_TARGETS).toMatch(/countVerifiableModules\([^)]*\)\s*>\s*0/);
  });

  it('search_targets flags rather than hides an unattackable safe', () => {
    expect(SEARCH_TARGETS).toContain('countVerifiableModules');
    expect(SEARCH_TARGETS).toContain('no_verifiable_lock');
  });

  it('search_targets never returns email or a user id', () => {
    // The only identifier that leaves the server is the safe id.
    expect(SEARCH_CODE).not.toMatch(/\bemail\b/);
    const selects = [...SEARCH_CODE.matchAll(/\.select\('([^']+)'\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThan(0);
    for (const sel of selects) {
      // owner_id may be selected for filtering, but must not be mapped
      // onto the returned card.
      expect(sel).not.toMatch(/\bid\s*,\s*email\b/);
    }
    expect(SEARCH_CODE).not.toMatch(/owner_id:\s*row\.owner_id/);
    expect(SEARCH_CODE).toMatch(/id:\s*row\.id as string/);
  });

  it('search_targets is rate limited and capped', () => {
    expect(SEARCH_TARGETS).toContain('rate_limited');
    expect(SEARCH_TARGETS).toMatch(/MAX_RESULTS\s*=\s*10/);
    expect(SEARCH_TARGETS).toMatch(/\.limit\(MAX_RESULTS\)/);
  });
});

describe('cooldown is a balance knob, tuned for playtesting', () => {
  it('is minutes, not an hour', () => {
    expect(ECONOMY.samTargetCooldown).toBeLessThanOrEqual(5 * 60);
    expect(ECONOMY.samTargetCooldown).toBeGreaterThanOrEqual(3 * 60);
  });
});
