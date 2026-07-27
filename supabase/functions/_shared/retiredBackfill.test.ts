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

  it('skips custom games and verifies completeness in-migration', () => {
    // Guard rails we rely on rather than re-implementing here.
    expect(SQL).toContain("(m->>'customGameId') is null");
    expect(SQL).toContain("(m->'customConfig') is null");
    expect(SQL).toContain('backfill incomplete');
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
