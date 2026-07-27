/**
 * SERVER/CLIENT CONTRACT (regression test for the 2026-07-27 skew
 * incident): the Edge Functions redeployed with `chesspuzzle` in the
 * dealable roster while the shipped frontend had no component for it,
 * so ~6% of live targets rendered "Unknown module — counting as a
 * failed lock" and players forfeited real stakes.
 *
 * This test fails CI if the two rosters ever drift apart again.
 */
import { describe, it, expect } from 'vitest';
import { MINIGAME_REGISTRY, clientSupportedModuleTypes } from '../components/minigames/registry';
import { SUPPORTED_MODULE_TYPES, ACTIVE_MODULE_TYPES, unsupportedTypesIn, renderableType } from './roster';
import { ALL_MODULE_TYPES } from './constants';
import type { ModuleType } from '../types';

describe('server-dealable roster ⊆ client registry', () => {
  it('every type the server may deal has a client component', () => {
    const client = new Set(clientSupportedModuleTypes());
    const missing = SUPPORTED_MODULE_TYPES.filter((t) => !client.has(t));
    expect(missing).toEqual([]);
  });

  it('every EQUIPPABLE type has a client component (bots and players deal these)', () => {
    const client = new Set(clientSupportedModuleTypes());
    expect(ACTIVE_MODULE_TYPES.filter((t) => !client.has(t))).toEqual([]);
  });

  it('every MODULE_CONFIG type has a client component — adding a game without one fails here', () => {
    // Retired types keep components so history/legacy loadouts render.
    const client = new Set(clientSupportedModuleTypes());
    const missing = ALL_MODULE_TYPES.filter((t) => !client.has(t));
    expect(missing).toEqual([]);
  });

  it('the client registry declares exactly its registered keys', () => {
    expect(new Set(clientSupportedModuleTypes())).toEqual(new Set(Object.keys(MINIGAME_REGISTRY)));
  });
});

describe('unsupportedTypesIn', () => {
  const mod = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra }) as {
    type: string;
    customConfig?: { baseEngine?: string; mode?: string };
  };

  it('flags a type the given client cannot render', () => {
    const loadout = { modules: [mod('keypad'), mod('chesspuzzle')] };
    // A stale client that predates chesspuzzle:
    const stale = ALL_MODULE_TYPES.filter((t) => t !== 'chesspuzzle');
    expect(unsupportedTypesIn(loadout, stale)).toEqual(['chesspuzzle']);
    // A current client renders everything:
    expect(unsupportedTypesIn(loadout, clientSupportedModuleTypes())).toEqual([]);
  });

  it('DSL customs are always renderable (fixed interpreter, no per-type component)', () => {
    const dsl = mod('maze', { customConfig: { baseEngine: 'maze', mode: 'dsl_program' } });
    expect(renderableType(dsl)).toBeNull();
    expect(unsupportedTypesIn({ modules: [dsl] }, [])).toEqual([]);
  });

  it('engine_config customs are checked against their base engine', () => {
    const custom = mod('custom', { customConfig: { baseEngine: 'chesspuzzle', mode: 'engine_config' } });
    const stale = ALL_MODULE_TYPES.filter((t) => t !== 'chesspuzzle') as ModuleType[];
    expect(unsupportedTypesIn({ modules: [custom] }, stale)).toEqual(['chesspuzzle']);
  });
});
