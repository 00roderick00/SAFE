// Pure helpers that build the payloads Edge Functions exchange with
// the client. Extracted here so unit tests can exercise them without
// booting Deno.serve or the Supabase client.

import { calculateAttackFee, calculateLoot } from './economy.ts';
import { ECONOMY, MODULE_CONFIG, ALL_MODULE_TYPES } from './constants.ts';
import { newSeed, createRng } from './rng.ts';
import type { ModuleType, SecurityLoadout, SecurityModule } from './types.ts';

export interface AttackModuleSeed {
  index: number;
  moduleType: ModuleType;
  difficulty: number;
  seed: string;
  /** For custom-game slots: the AI-generated engine config or DSL
   *  program (see `mode`). Sent to the client so the minigame can
   *  render with the same tuned parameters the creator built. */
  config?: unknown;
  /** For custom-game slots: the underlying engine to render. */
  baseEngine?: ModuleType;
  /** For custom-game slots: which renderer to use. Absent = built-in. */
  mode?: 'engine_config' | 'dsl_program';
}

export interface AttackStartPayload {
  attackId: string;
  defenderHandle: string;
  isBotTarget: boolean;
  stake: number;
  potentialLoot: number;
  modules: AttackModuleSeed[];
}

/**
 * Build the per-module seed list for an attack. The seeds are
 * strings so we can log/inspect them; the game-side RNG hashes them
 * to a mulberry32 stream (see rng.ts).
 */
export function buildAttackSeeds(
  attackId: string,
  loadout: SecurityLoadout
): AttackModuleSeed[] {
  return loadout.modules.map((mod, index) => {
    const seed: AttackModuleSeed = {
      index,
      moduleType: mod.type,
      difficulty: mod.difficulty,
      seed: newSeed(`${attackId}-${index}-${mod.type}`),
    };
    if (mod.customConfig) {
      seed.config = mod.customConfig.config;
      seed.baseEngine = mod.customConfig.baseEngine;
      seed.mode = mod.customConfig.mode;
    }
    return seed;
  });
}

/**
 * Resolve the stake for an attack from safe balance + loadout score.
 * Applied by start_attack before deducting from the attacker.
 */
export function computeStake(
  defenderBalance: number,
  defenderScore: number,
  attackerBalance: number
): number {
  return calculateAttackFee(defenderBalance, defenderScore, attackerBalance);
}

/**
 * Loot on a successful all-or-nothing breach. Split reported here so
 * ledger writes are unambiguous.
 */
export function computeLootSplit(defenderBalance: number): {
  potentialLoot: number;
  attackerReceives: number;
  platformReceives: number;
  defenderLoses: number;
} {
  const potentialLoot = calculateLoot(defenderBalance);
  const platformReceives = Math.round(potentialLoot * ECONOMY.platformCut);
  const attackerReceives = potentialLoot - platformReceives;
  return {
    potentialLoot,
    attackerReceives,
    platformReceives,
    defenderLoses: potentialLoot,
  };
}

/**
 * Creator-royalty math for custom-game modules in a defender's
 * loadout. On both win and loss the creators earn a small cut,
 * paid from the platform side so attacker/defender economics stay
 * intact:
 *
 *   Win  → 20% of platformReceives, split equally among custom
 *          modules in the loadout. Platform keeps the remainder.
 *   Loss → floor(stake * 0.02) per custom module (defense bonus),
 *          drawn from platform revenue (bot targets) or from the
 *          defender's fee (real targets). We MODEL it as coming
 *          from the platform so the defender's fee stays whole;
 *          against a bot the platform absorbs it too. That keeps
 *          the per-user ledger easier to reason about.
 *
 * `distinctCreators` is the caller-controlled distinct-creator
 * count. Passing 0 disables royalties (no custom modules).
 */
export function computeCreatorRoyalty(input: {
  outcome: 'won' | 'lost';
  stake: number;
  platformReceivesOnWin: number;
  distinctCreators: number;
}): { perCreator: number; totalRoyalty: number } {
  if (input.distinctCreators <= 0) {
    return { perCreator: 0, totalRoyalty: 0 };
  }
  if (input.outcome === 'won') {
    const pool = Math.round(input.platformReceivesOnWin * 0.2);
    const per = Math.floor(pool / input.distinctCreators);
    return { perCreator: per, totalRoyalty: per * input.distinctCreators };
  }
  // Loss / abandon: fixed 2% of stake per creator.
  const per = Math.floor(input.stake * 0.02);
  return { perCreator: per, totalRoyalty: per * input.distinctCreators };
}

/**
 * Deterministic bot loadout for backfilling the target list when
 * player density is low. Seed makes it reproducible for a given bot
 * id, so opening the target list twice does not shuffle bots.
 */
export function generateBotLoadout(seed: string, difficultyBias: number = 0.5): SecurityLoadout {
  const rng = createRng(seed);
  const modules: SecurityModule[] = [];
  const usedTypes = new Set<ModuleType>();

  while (modules.length < ECONOMY.maxModules) {
    const pick = ALL_MODULE_TYPES[Math.floor(rng() * ALL_MODULE_TYPES.length)];
    if (usedTypes.has(pick)) continue;
    usedTypes.add(pick);

    const jitter = (rng() - 0.5) * 0.3;
    const difficulty = Math.max(0.1, Math.min(0.95, difficultyBias + jitter));
    const config = MODULE_CONFIG[pick];
    modules.push({
      id: `${seed}-${pick}`,
      type: pick,
      difficulty,
      weight: config.baseWeight,
      name: config.name,
      description: config.description,
    });
  }

  return { modules, effectiveScore: 0 };
}
