import { describe, it, expect } from 'vitest';
import {
  RETIRED_MODULE_TYPES,
  RETIRED_REPLACEMENTS,
  ACTIVE_MODULE_TYPES,
  ACTIVE_MODULE_TYPES_BY_CATEGORY,
  isRetiredModuleType,
  migrateRetiredLoadout,
} from './roster';
import { ALL_MODULE_TYPES } from './constants';
import { VERIFIABLE_LOCK_TYPES, countVerifiableModules } from './lock-solutions';
import { generateBotLoadout } from './attack-flow';
import type { SecurityLoadout, SecurityModule } from './types';

const mod = (type: string, extra: Partial<SecurityModule> = {}): SecurityModule => ({
  id: `m-${type}`,
  type: type as SecurityModule['type'],
  difficulty: 0.4,
  weight: 1,
  name: type,
  description: type,
  ...extra,
});

const loadoutOf = (...modules: SecurityModule[]): SecurityLoadout => ({ modules, effectiveScore: 0 });

describe('retired roster', () => {
  it('retires exactly the audited cut list', () => {
    expect([...RETIRED_MODULE_TYPES].sort()).toEqual([
      'asteroids', 'centipede', 'digdug', 'donkeykong', 'frogger',
      'galaga', 'pacman', 'qbert', 'snake', 'spaceinvaders', 'wordscramble',
    ]);
  });

  it('active roster = all types minus retired, with no overlap', () => {
    expect(ACTIVE_MODULE_TYPES.length).toBe(ALL_MODULE_TYPES.length - RETIRED_MODULE_TYPES.length);
    for (const t of RETIRED_MODULE_TYPES) {
      expect(ACTIVE_MODULE_TYPES).not.toContain(t);
      expect(isRetiredModuleType(t)).toBe(true);
    }
    for (const cat of ['classic', 'arcade', 'puzzle'] as const) {
      for (const t of ACTIVE_MODULE_TYPES_BY_CATEGORY[cat]) {
        expect(isRetiredModuleType(t)).toBe(false);
      }
    }
  });

  it('SECURITY: no retired type is server-verifiable, and every replacement is active', () => {
    // Retiring only class-2 types means migration can never change a
    // safe's verifiableCount — the forgery guarantee is untouched.
    for (const t of RETIRED_MODULE_TYPES) {
      expect(VERIFIABLE_LOCK_TYPES as readonly string[]).not.toContain(t);
      const replacement = RETIRED_REPLACEMENTS[t];
      expect(ACTIVE_MODULE_TYPES).toContain(replacement);
      // Replacements are also class-2, so counts stay identical.
      expect(VERIFIABLE_LOCK_TYPES as readonly string[]).not.toContain(replacement);
    }
  });
});

describe('migrateRetiredLoadout', () => {
  it('substitutes retired built-ins with their kept analogs, preserving id and difficulty', () => {
    const before = loadoutOf(mod('keypad'), mod('galaga', { difficulty: 0.77 }), mod('snake'));
    const { loadout, changed, replaced } = migrateRetiredLoadout(before);
    expect(changed).toBe(true);
    expect(replaced).toEqual([
      { from: 'galaga', to: 'breakout' },
      { from: 'snake', to: 'maze' },
    ]);
    expect(loadout.modules.map((m) => m.type)).toEqual(['keypad', 'breakout', 'maze']);
    expect(loadout.modules[1].difficulty).toBe(0.77);
    expect(loadout.modules[1].id).toBe('m-galaga');
    // Display strings come from the replacement's config.
    expect(loadout.modules[1].name).not.toBe('galaga');
  });

  it('is a no-op (same object) for loadouts with no retired types', () => {
    const before = loadoutOf(mod('keypad'), mod('slider'), mod('memorymatch'));
    const res = migrateRetiredLoadout(before);
    expect(res.changed).toBe(false);
    expect(res.loadout).toBe(before);
  });

  it('relabels a custom module off a retired type but keeps it playable', () => {
    // Previously custom modules were skipped wholesale, which let a
    // live safe keep advertising `pacman`/`qbert` on its target card
    // (see roster.retired.regression.test.ts). The game still plays —
    // only the stale engine label is corrected.
    const custom = mod('qbert', {
      customGameId: 'cg-1',
      customConfig: { baseEngine: 'qbert' as SecurityModule['type'], config: {}, mode: 'engine_config' },
    });
    const res = migrateRetiredLoadout(loadoutOf(custom));
    expect(res.changed).toBe(true);
    expect(res.loadout.modules[0].type).toBe('maze');
    expect(res.loadout.modules[0].customGameId).toBe('cg-1');
    expect(res.loadout.modules[0].customConfig?.mode).toBe('engine_config');
  });

  it('leaves a custom module alone when its type is already active', () => {
    const custom = mod('maze', {
      customGameId: 'cg-2',
      customConfig: { baseEngine: 'maze' as SecurityModule['type'], config: {}, mode: 'dsl_program' },
    });
    const res = migrateRetiredLoadout(loadoutOf(custom));
    expect(res.changed).toBe(false);
  });

  it('SECURITY: migration never changes verifiableCount for any composition', () => {
    const compositions = [
      loadoutOf(mod('keypad'), mod('galaga'), mod('snake')),
      loadoutOf(mod('pacman'), mod('qbert'), mod('donkeykong')),
      loadoutOf(mod('keypad'), mod('colorcode'), mod('combination')),
      loadoutOf(mod('wordscramble'), mod('combination'), mod('frogger')),
    ];
    for (const before of compositions) {
      const after = migrateRetiredLoadout(before).loadout;
      expect(countVerifiableModules(after)).toBe(countVerifiableModules(before));
    }
  });
});

describe('generateBotLoadout after retirement', () => {
  it('never deals a retired type, stays deterministic, and keeps a verifiable slot 0', () => {
    for (let i = 0; i < 50; i++) {
      const a = generateBotLoadout(`bot-${i}`, 0.5);
      const b = generateBotLoadout(`bot-${i}`, 0.5);
      expect(a).toEqual(b);
      for (const m of a.modules) expect(isRetiredModuleType(m.type)).toBe(false);
      expect(countVerifiableModules(a)).toBeGreaterThanOrEqual(1);
    }
  });
});
