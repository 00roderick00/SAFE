// Tactile-redesign roster (TACTILE-REDESIGN.md).
//
// Retired module types can no longer be EQUIPPED (player loadouts, game
// picker) or picked for bot loadouts — but they keep their registry
// entries and MODULE_CONFIG so historical loadouts, attack snapshots and
// history rows referencing them still render and settle.
//
// Why each is retired (full audit in PROGRESS-TACTILE.md):
// - D-pad/virtual-button-only control, no direct touch manipulation
//   (all 10 arcade cuts, wordscramble's virtual QWERTY), and/or
// - runtime RNG hazards that can end a run regardless of skill
//   (galaga, digdug, qbert, asteroids, frogger), and/or
// - broken outcome reporting (donkeykong unwinnable, pacman/frogger/
//   wordscramble stale-closure always-0 submissions).
//
// SECURITY INVARIANT: every retired type is class-2 (never server-
// verifiable), and every replacement is also class-2 — so migrating a
// loadout can never change its verifiableCount, and the composition
// guarantee in PROGRESS-SECURITY.md ("no safe breachable with a forged
// result") is unaffected. Enforced by roster tests.

import { MODULE_CONFIG, MODULE_TYPES_BY_CATEGORY, ALL_MODULE_TYPES } from './constants.ts';
import type { ModuleType, SecurityLoadout, SecurityModule } from './types.ts';

export const RETIRED_MODULE_TYPES: readonly ModuleType[] = [
  'pacman',
  'spaceinvaders',
  'frogger',
  'donkeykong',
  'centipede',
  'asteroids',
  'snake',
  'galaga',
  'digdug',
  'qbert',
  'wordscramble',
] as const;

const RETIRED_SET = new Set<string>(RETIRED_MODULE_TYPES);

export function isRetiredModuleType(type: string): boolean {
  return RETIRED_SET.has(type);
}

/** Equippable roster: everything not retired. */
export const ACTIVE_MODULE_TYPES: ModuleType[] = ALL_MODULE_TYPES.filter(
  (t) => !RETIRED_SET.has(t),
);

export const ACTIVE_MODULE_TYPES_BY_CATEGORY: Record<'classic' | 'arcade' | 'puzzle', ModuleType[]> = {
  classic: MODULE_TYPES_BY_CATEGORY.classic.filter((t) => !RETIRED_SET.has(t)),
  arcade: MODULE_TYPES_BY_CATEGORY.arcade.filter((t) => !RETIRED_SET.has(t)),
  puzzle: MODULE_TYPES_BY_CATEGORY.puzzle.filter((t) => !RETIRED_SET.has(t)),
};

/** Closest kept analog for each retired type, used to transparently
 *  migrate an equipped loadout so a live safe never becomes unplayable. */
export const RETIRED_REPLACEMENTS: Record<string, ModuleType> = {
  pacman: 'maze', // grid navigation
  spaceinvaders: 'breakout', // projectile/deflection arcade
  frogger: 'reaction', // reflex timing
  donkeykong: 'breakout',
  centipede: 'breakout',
  asteroids: 'breakout',
  snake: 'maze',
  galaga: 'breakout',
  digdug: 'maze',
  qbert: 'maze',
  wordscramble: 'wordsearch', // word puzzle
};

/**
 * Replace any retired module in an equipped loadout with its kept
 * analog, preserving id, difficulty and any custom-game linkage slot
 * position. Pure; returns `changed: false` (and the same object) when
 * nothing needed migrating.
 *
 * Custom games (`type: 'custom'` or a customConfig payload) are never
 * touched — retirement only applies to the built-in roster. A custom
 * game whose baseEngine is retired keeps working through the registry.
 */
export function migrateRetiredLoadout(loadout: SecurityLoadout): { loadout: SecurityLoadout; changed: boolean; replaced: { from: ModuleType; to: ModuleType }[] } {
  const replaced: { from: ModuleType; to: ModuleType }[] = [];
  const modules: SecurityModule[] = loadout.modules.map((m) => {
    if (m.customConfig || m.customGameId || !RETIRED_SET.has(m.type)) return m;
    const to = RETIRED_REPLACEMENTS[m.type] ?? 'memorymatch';
    const config = MODULE_CONFIG[to as keyof typeof MODULE_CONFIG];
    replaced.push({ from: m.type, to });
    return {
      ...m,
      type: to,
      name: config.name,
      description: config.description,
      weight: config.baseWeight,
    };
  });
  if (replaced.length === 0) return { loadout, changed: false, replaced };
  return { loadout: { ...loadout, modules }, changed: true, replaced };
}
