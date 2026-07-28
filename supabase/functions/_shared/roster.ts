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

/** Client-render contract: every module type the shipped client can
 *  render (each has a MINIGAME_REGISTRY entry — enforced by
 *  rosterContract.test.ts, which fails CI if a type is added to
 *  MODULE_CONFIG without a client component). The server must NEVER
 *  deal a lock outside this list: start_attack refuses (pre-stake)
 *  any target whose loadout the requesting client says it can't
 *  render. This is the guard against the 2026-07-27 version-skew
 *  incident where redeployed functions dealt `chesspuzzle` to
 *  frontends that predated the component and players forfeited
 *  stakes on "Unknown module". */
export const SUPPORTED_MODULE_TYPES: ModuleType[] = [...ALL_MODULE_TYPES];

/** Renderable module type for support checks: DSL games render through
 *  the fixed interpreter (no per-type component), everything else —
 *  including engine_config customs — renders via its (base) engine. */
export function renderableType(module: { type: string; customConfig?: { baseEngine?: string; mode?: string } }): string | null {
  if (module.customConfig?.mode === 'dsl_program') return null;
  return module.customConfig?.baseEngine ?? module.type;
}

/** Module types in `loadout` that `supported` cannot render. */
export function unsupportedTypesIn(
  loadout: { modules: { type: string; customConfig?: { baseEngine?: string; mode?: string } }[] },
  supported: readonly string[],
): string[] {
  const set = new Set(supported);
  const out = new Set<string>();
  for (const m of loadout.modules) {
    const t = renderableType(m);
    if (t !== null && !set.has(t)) out.add(t);
  }
  return [...out];
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

/** Fallback order when a retired module's preferred replacement is
 *  already occupied in the same loadout — a safe should not end up with
 *  two identical locks. Ordered so the substitute stays close in feel
 *  (tap-native, comparable pacing) before falling back to the rest of
 *  the active roster. */
const REPLACEMENT_FALLBACKS: ModuleType[] = [
  'maze', 'breakout', 'reaction', 'wordsearch', 'memorymatch', 'spotdiff',
  'jigsaw', 'numsequence', 'quickmath', 'logic', 'cipher', 'sudoku',
];

/** First type in the preference order that isn't already taken.
 *  `firstChoice` lets a custom module ask for its own base engine
 *  before falling back to the retirement analog. */
function pickReplacement(from: string, taken: Set<string>, firstChoice?: string): ModuleType {
  const preferred = RETIRED_REPLACEMENTS[from];
  const order: ModuleType[] = [
    ...(firstChoice ? [firstChoice as ModuleType] : []),
    ...(preferred ? [preferred] : []),
    ...REPLACEMENT_FALLBACKS,
    ...ACTIVE_MODULE_TYPES,
  ];
  for (const candidate of order) {
    if (!RETIRED_SET.has(candidate) && !taken.has(candidate)) return candidate;
  }
  // Every active type is already equipped (impossible at 3 slots) —
  // fall back to the preferred analog even though it duplicates.
  return preferred ?? 'memorymatch';
}

/**
 * Normalize an equipped loadout so no module stores a RETIRED type,
 * preserving slot order, id and difficulty. Pure; returns
 * `changed: false` (and the same object) when nothing needed migrating.
 *
 * Two cases:
 *
 * 1. **Built-in module** — substituted with its kept analog
 *    (`RETIRED_REPLACEMENTS`), skipping any type already present in the
 *    loadout so migration never produces two identical locks.
 *
 * 2. **Custom game** (`customGameId` / `customConfig`) — the game keeps
 *    playing (DSL games render through the interpreter; engine_config
 *    games through their base engine), but a stale `type` is corrected
 *    to the engine that actually renders it, i.e. `customConfig.
 *    baseEngine`. This is a truth fix, not a substitution: a live safe
 *    was storing `type: 'pacman'` on a DSL game whose baseEngine was
 *    `maze`, which showed attackers a retired game on the target card.
 *    If the baseEngine is itself retired, it is substituted as in (1).
 *    The custom game's own name/description/weight are left alone.
 */
export function migrateRetiredLoadout(loadout: SecurityLoadout): { loadout: SecurityLoadout; changed: boolean; replaced: { from: ModuleType; to: ModuleType }[] } {
  const replaced: { from: ModuleType; to: ModuleType }[] = [];
  // Types that must not be duplicated: everything already equipped that
  // isn't itself being migrated away.
  const taken = new Set<string>(
    loadout.modules.filter((m) => !RETIRED_SET.has(m.type)).map((m) => m.type),
  );

  const modules: SecurityModule[] = loadout.modules.map((m) => {
    if (!RETIRED_SET.has(m.type)) return m;

    const isCustom = Boolean(m.customGameId || m.customConfig);
    if (isCustom) {
      // Prefer the engine that actually renders it; if that label is
      // already equipped, fall through so the safe doesn't show two
      // identical locks. (For a custom module `type` is only a label —
      // DSL games render through the interpreter and engine_config
      // games through customConfig.baseEngine, never through `type`.)
      const baseEngine = m.customConfig?.baseEngine;
      const firstChoice = baseEngine && !RETIRED_SET.has(baseEngine) ? baseEngine : undefined;
      const to = pickReplacement(baseEngine ?? m.type, taken, firstChoice);
      taken.add(to);
      replaced.push({ from: m.type, to });
      // Keep the creator's name/description/weight — only the engine
      // label was wrong.
      return { ...m, type: to };
    }

    const to = pickReplacement(m.type, taken);
    taken.add(to);
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

/** True when any module in the loadout still stores a retired type. */
export function hasRetiredModule(loadout: { modules: { type: string }[] }): boolean {
  return loadout.modules.some((m) => RETIRED_SET.has(m.type));
}
