/**
 * The one-off server-side backfill
 * (migrations/20260727120000_backfill_retired_loadouts.sql) hard-codes
 * the retired→replacement map in SQL. This test parses that SQL and
 * asserts it matches RETIRED_REPLACEMENTS and MODULE_CONFIG exactly, so
 * the migration can never silently disagree with the TypeScript the
 * client migrates with.
 *
 * It also re-asserts the security invariant for the backfill itself:
 * substituting these types cannot change any safe's verifiableCount.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  RETIRED_MODULE_TYPES,
  RETIRED_REPLACEMENTS,
  migrateRetiredLoadout,
} from './roster';
import { MODULE_CONFIG } from './constants';
import { countVerifiableModules } from './lock-solutions';
import type { SecurityLoadout, SecurityModule } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(
  join(here, '../../migrations/20260727120000_backfill_retired_loadouts.sql'),
  'utf8',
);
/** The enforcement migration: trigger + normalizer + re-backfill. */
const ENFORCE_SQL = readFileSync(
  join(here, '../../migrations/20260727230000_enforce_no_retired_loadouts.sql'),
  'utf8',
);
/** The currently-authoritative normalizer body (supersedes the one in
 *  ENFORCE_SQL, whose fallback walk disagreed with the TypeScript). */
const NORMALIZER_SQL = readFileSync(
  join(here, '../../migrations/20260727233000_align_normalizer_fallbacks.sql'),
  'utf8',
);

/** Parse the `values (...)` rows of the _retired_repl seed table. */
function parseSqlMap(): Record<string, { type: string; name: string; description: string; weight: number }> {
  const rowRe = /\(\s*'([a-z]+)',\s*'([a-z]+)',\s*'([^']+)',\s*'([^']+)',\s*([\d.]+)\s*\)/g;
  const out: Record<string, { type: string; name: string; description: string; weight: number }> = {};
  for (const m of SQL.matchAll(rowRe)) {
    out[m[1]] = { type: m[2], name: m[3], description: m[4], weight: Number(m[5]) };
  }
  return out;
}

describe('backfill SQL matches the TypeScript replacement map', () => {
  const sqlMap = parseSqlMap();

  it('covers every retired type exactly once', () => {
    expect(Object.keys(sqlMap).sort()).toEqual([...RETIRED_MODULE_TYPES].sort());
  });

  it('maps each retired type to the same replacement as RETIRED_REPLACEMENTS', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      expect(sqlMap[retired].type).toBe(RETIRED_REPLACEMENTS[retired]);
    }
  });

  it('carries the replacement’s real name/description/weight from MODULE_CONFIG', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      const replacement = RETIRED_REPLACEMENTS[retired];
      const cfg = MODULE_CONFIG[replacement as keyof typeof MODULE_CONFIG] as {
        name: string; description: string; baseWeight: number;
      };
      expect(sqlMap[retired].name).toBe(cfg.name);
      expect(sqlMap[retired].description).toBe(cfg.description);
      expect(sqlMap[retired].weight).toBe(cfg.baseWeight);
    }
  });

  it('verifies completeness in-migration', () => {
    expect(SQL).toContain('backfill incomplete');
  });
});

describe('enforcement migration (trigger) stays in sync with the TypeScript', () => {
  it('maps every retired type the same way as RETIRED_REPLACEMENTS', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      const re = new RegExp(`when '${retired}'\\s*then '([a-z]+)'`);
      const m = ENFORCE_SQL.match(re);
      expect(m, `no SQL mapping for ${retired}`).not.toBeNull();
      expect(m![1]).toBe(RETIRED_REPLACEMENTS[retired]);
    }
  });

  it('lists every retired type in the trigger’s `retired` array', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      expect(ENFORCE_SQL).toContain(`'${retired}'`);
    }
  });

  it('its replacement metadata matches MODULE_CONFIG exactly', () => {
    const rowRe = /when '([a-z]+)'\s*then '\{"name":"([^"]+)","description":"([^"]+)","weight":([\d.]+)\}'/g;
    let seen = 0;
    for (const m of ENFORCE_SQL.matchAll(rowRe)) {
      const [, type, name, description, weight] = m;
      const cfg = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG] as {
        name: string; description: string; baseWeight: number;
      };
      expect(cfg, `unknown type ${type} in trigger metadata`).toBeDefined();
      expect(name).toBe(cfg.name);
      expect(description).toBe(cfg.description);
      expect(Number(weight)).toBe(cfg.baseWeight);
      seen++;
    }
    expect(seen).toBeGreaterThanOrEqual(12);
  });

  it('the authoritative normalizer walks the SAME fallback order as REPLACEMENT_FALLBACKS', () => {
    // Mirrors the array literal in the migration.
    const m = NORMALIZER_SQL.match(/fallbacks\s+text\[\]\s*:=\s*array\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const sqlOrder = m![1].split(',').map((t) => t.trim().replace(/'/g, '')).filter(Boolean);
    // The TS list is not exported; assert against the known order and
    // against what migrateRetiredLoadout actually produces below.
    expect(sqlOrder.slice(0, 5)).toEqual(['maze', 'breakout', 'reaction', 'wordsearch', 'memorymatch']);
  });

  it('the authoritative normalizer agrees with migrateRetiredLoadout on the production shape', () => {
    // The migration self-tests this exact expectation server-side; here
    // we assert the TypeScript half produces the same answer, so the
    // two implementations cannot drift.
    const dsl = { mode: 'dsl_program' as const, config: { version: 1 }, baseEngine: 'maze' as SecurityModule['type'] };
    const before: SecurityLoadout = {
      effectiveScore: 29.48,
      modules: [
        { id: 'cg-slot-0', type: 'pacman', difficulty: 0.3, weight: 1.2, name: 'Pac-Man', description: 'x', customGameId: 'cg', customConfig: dsl },
        { id: 'cg-slot-1', type: 'quickmath', difficulty: 0.3, weight: 1, name: 'Math', description: 'y', customGameId: 'cg', customConfig: dsl },
        { id: 'm-2', type: 'maze', difficulty: 0.3, weight: 1, name: 'Maze', description: 'z' },
      ],
    };
    const tsResult = migrateRetiredLoadout(before).loadout.modules.map((m) => m.type);
    expect(tsResult).toEqual(['breakout', 'quickmath', 'maze']);
    expect(NORMALIZER_SQL).toContain("array['breakout','quickmath','maze']");
  });

  it('installs a BEFORE INSERT OR UPDATE trigger and self-tests before backfilling', () => {
    expect(ENFORCE_SQL).toContain('before insert or update of security_loadout on public.safes');
    expect(ENFORCE_SQL).toContain('normalizer self-test failed');
    expect(ENFORCE_SQL).toContain('backfill incomplete');
    // The jsonb-null trap that made the first backfill miss this safe.
    expect(ENFORCE_SQL).toContain("jsonb_typeof(m->'customConfig') = 'object'");
  });
});

describe('SECURITY: the backfill cannot make a safe forgeable', () => {
  const mod = (type: string): SecurityModule => ({
    id: `m-${type}`, type: type as SecurityModule['type'], difficulty: 0.5, weight: 1,
    name: type, description: type,
  });

  it('verifiableCount is identical before and after, for every retired type', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      // Alone, and alongside a verifiable lock, and alongside class-2.
      const compositions: SecurityLoadout[] = [
        { modules: [mod(retired)], effectiveScore: 0 },
        { modules: [mod('keypad'), mod(retired)], effectiveScore: 0 },
        { modules: [mod(retired), mod('timing'), mod('slider')], effectiveScore: 0 },
      ];
      for (const before of compositions) {
        const after = migrateRetiredLoadout(before).loadout;
        expect(countVerifiableModules(after)).toBe(countVerifiableModules(before));
        expect(after.modules.length).toBe(before.modules.length);
      }
    }
  });

  it("trevor.mentis's live composition (spaceinvaders + keypad + timing) keeps its verifiable lock", () => {
    const before: SecurityLoadout = {
      modules: [mod('spaceinvaders'), mod('keypad'), mod('timing')],
      effectiveScore: 0,
    };
    const { loadout: after, changed } = migrateRetiredLoadout(before);
    expect(changed).toBe(true);
    expect(after.modules.map((m) => m.type)).toEqual(['breakout', 'keypad', 'timing']);
    expect(countVerifiableModules(after)).toBe(1);
    expect(countVerifiableModules(after)).toBe(countVerifiableModules(before));
  });
});
