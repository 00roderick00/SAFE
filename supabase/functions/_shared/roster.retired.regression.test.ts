/**
 * Regression for the 2026-07-27 reintroduction: roderick.jones's live
 * safe served `pacman, quickmath, maze` AFTER the backfill, and a full
 * client reload did not heal it.
 *
 * Root cause: the offending module was a CUSTOM (DSL) game stored with
 * `type: 'pacman'` while its `customConfig.baseEngine` was `maze`. Both
 * migrateRetiredLoadout and the SQL backfill skipped custom modules
 * wholesale, so nothing ever corrected the stale label — the safe kept
 * advertising a retired game on its public target card.
 *
 * Secondary defect: substituting `pacman -> maze` in a loadout that
 * already contained `maze` produced two identical locks.
 */
import { describe, it, expect } from 'vitest';
import { migrateRetiredLoadout, hasRetiredModule, RETIRED_MODULE_TYPES } from './roster';
import { countVerifiableModules } from './lock-solutions';
import type { SecurityLoadout, SecurityModule } from './types';

const CUSTOM_GAME_ID = 'd4631917-95a1-45aa-a7fa-ca2100f80461';
const DSL_CONFIG = { version: 1, board: { width: 9, height: 9 }, entities: [], timeLimit: 24, winCondition: 'reach_goal' };

/** The exact shape observed in public_safe_snapshots. */
const PRODUCTION_LOADOUT = (): SecurityLoadout => ({
  effectiveScore: 29.48,
  modules: [
    {
      id: `${CUSTOM_GAME_ID}-slot-0`,
      name: 'Pac-Man',
      type: 'pacman',
      weight: 1.2,
      difficulty: 0.3,
      description: 'Eat dots, avoid ghost',
      customGameId: CUSTOM_GAME_ID,
      customConfig: { mode: 'dsl_program', config: DSL_CONFIG, baseEngine: 'maze' },
    },
    {
      id: `${CUSTOM_GAME_ID}-slot-1`,
      name: 'Math',
      type: 'quickmath',
      weight: 1,
      difficulty: 0.3,
      description: 'Solve fast',
      customGameId: CUSTOM_GAME_ID,
      customConfig: { mode: 'dsl_program', config: DSL_CONFIG, baseEngine: 'maze' },
    },
    { id: 'module-2-1783693836264', name: 'Maze', type: 'maze', weight: 1, difficulty: 0.3, description: 'Find the exit' },
  ] as SecurityModule[],
});

describe("roderick.jones's live loadout (pacman, quickmath, maze)", () => {
  it('is detected as carrying a retired type', () => {
    expect(hasRetiredModule(PRODUCTION_LOADOUT())).toBe(true);
  });

  it('migrates the retired CUSTOM module — the case that previously slipped through', () => {
    const { loadout, changed, replaced } = migrateRetiredLoadout(PRODUCTION_LOADOUT());
    expect(changed).toBe(true);
    expect(hasRetiredModule(loadout)).toBe(false);
    expect(replaced).toEqual([{ from: 'pacman', to: 'breakout' }]);
  });

  it('does NOT create a duplicate lock (maze was already equipped)', () => {
    const { loadout } = migrateRetiredLoadout(PRODUCTION_LOADOUT());
    const types = loadout.modules.map((m) => m.type);
    expect(types).toEqual(['breakout', 'quickmath', 'maze']);
    expect(new Set(types).size).toBe(types.length);
  });

  it('keeps the custom game playable: id, DSL config and mode survive', () => {
    const { loadout } = migrateRetiredLoadout(PRODUCTION_LOADOUT());
    const migrated = loadout.modules[0];
    expect(migrated.customGameId).toBe(CUSTOM_GAME_ID);
    expect(migrated.customConfig?.mode).toBe('dsl_program');
    expect(migrated.customConfig?.config).toEqual(DSL_CONFIG);
    // The creator's own name/description are preserved — only the
    // engine label was wrong.
    expect(migrated.name).toBe('Pac-Man');
    expect(migrated.difficulty).toBe(0.3);
    expect(migrated.id).toBe(`${CUSTOM_GAME_ID}-slot-0`);
  });

  it('SECURITY: verifiableCount is unchanged (the DSL game stays DSL-verified)', () => {
    const before = PRODUCTION_LOADOUT();
    const after = migrateRetiredLoadout(before).loadout;
    expect(countVerifiableModules(before)).toBe(countVerifiableModules(after));
    expect(countVerifiableModules(after)).toBe(2); // two dsl_program modules
  });

  it('is idempotent — re-running changes nothing', () => {
    const once = migrateRetiredLoadout(PRODUCTION_LOADOUT()).loadout;
    const twice = migrateRetiredLoadout(once);
    expect(twice.changed).toBe(false);
    expect(twice.loadout.modules.map((m) => m.type)).toEqual(['breakout', 'quickmath', 'maze']);
  });
});

describe('no-duplicate replacement, generally', () => {
  const builtin = (type: string): SecurityModule => ({
    id: `m-${type}`, type: type as SecurityModule['type'], difficulty: 0.4, weight: 1,
    name: type, description: type,
  });

  it('never duplicates an already-equipped type for any retired input', () => {
    for (const retired of RETIRED_MODULE_TYPES) {
      // Occupy the primary analog AND a couple of fallbacks.
      const before: SecurityLoadout = {
        modules: [builtin(retired), builtin('maze'), builtin('breakout')],
        effectiveScore: 0,
      };
      const { loadout } = migrateRetiredLoadout(before);
      const types = loadout.modules.map((m) => m.type);
      expect(new Set(types).size, `duplicate produced migrating ${retired}`).toBe(types.length);
      expect(hasRetiredModule(loadout)).toBe(false);
    }
  });

  it('two retired modules in one loadout get distinct replacements', () => {
    const before: SecurityLoadout = {
      modules: [builtin('pacman'), builtin('snake'), builtin('digdug')],
      effectiveScore: 0,
    };
    const types = migrateRetiredLoadout(before).loadout.modules.map((m) => m.type);
    expect(new Set(types).size).toBe(3);
    expect(hasRetiredModule({ modules: types.map((t) => ({ type: t })) })).toBe(false);
  });

  it('a custom module on a RETIRED base engine is substituted, not relabelled to it', () => {
    const before: SecurityLoadout = {
      modules: [{
        id: 'cg-1-slot-0', name: 'My Game', type: 'galaga', weight: 1, difficulty: 0.5,
        description: 'community game',
        customGameId: 'cg-1',
        customConfig: { mode: 'engine_config', config: {}, baseEngine: 'galaga' as SecurityModule['type'] },
      }] as SecurityModule[],
      effectiveScore: 0,
    };
    const { loadout } = migrateRetiredLoadout(before);
    expect(hasRetiredModule(loadout)).toBe(false);
    expect(loadout.modules[0].type).toBe('breakout');
  });
});
