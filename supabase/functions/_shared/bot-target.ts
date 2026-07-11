// Deterministic bot-target generator.
//
// A bot target is uniquely identified by a seed string. The id shape
// is `bot_<seed>`. Given the id, both list_targets and start_attack
// can reconstruct byte-identical bot state (handle, balance,
// difficulty, loadout) — this is what makes it safe for the client
// to hand back a bot id when committing to an attack: the server
// never has to trust client-supplied bot parameters.
//
// Everything derived from the seed uses the SAME createRng(seed)
// stream, in the SAME order, both in generateBotTarget and (via
// generateBotLoadout) when start_attack re-derives the loadout.

import { createRng, newSeed } from './rng.ts';
import { calculateAttackFee, calculateSecurityScore, getDifficultyBand, getLootRange } from './economy.ts';
import { BOT_NAMES } from './constants.ts';
import { generateBotLoadout } from './attack-flow.ts';
import type { SecurityLoadout } from './types.ts';

export const BOT_ID_PREFIX = 'bot_';

export interface BotTarget {
  id: string;
  seed: string;
  handle: string;
  balance: number;
  difficulty: number;
  loadout: SecurityLoadout;
  securityScore: number;
  attackFee: number;
  difficultyBand: 'soft' | 'tricky' | 'brutal';
  lootRange: 'small' | 'moderate' | 'rich';
  isBot: true;
  tagline: string;
}

/** Extract the raw seed from a bot id string. Returns null if the
 *  id isn't a bot id (i.e. it's a real safe UUID). */
export function parseBotId(id: string): string | null {
  if (!id.startsWith(BOT_ID_PREFIX)) return null;
  const seed = id.slice(BOT_ID_PREFIX.length);
  return seed.length > 0 ? seed : null;
}

/** Mint a brand-new bot id (used only by list_targets). */
export function newBotId(): string {
  return `${BOT_ID_PREFIX}${newSeed('t')}`;
}

/** Pool of taglines a bot can be assigned. Seeded pick so a given
 *  bot always shows the same one. */
const TAGLINES = [
  'Come at me if you dare',
  'Playing the meta',
  'Think you can outsmart me?',
  'Untouchable',
  'Vault of the void',
  'Try your luck',
  'Locks and loaded',
  'Every attempt logged',
];

/**
 * Rebuild the full bot spec from a seed. Same seed → identical spec,
 * always. If you change what this function draws from the RNG you
 * MUST bump the seed prefix or old ids will resolve to a different
 * bot on the next deploy (silent corruption).
 */
export function generateBotTarget(seed: string, attackerBalance?: number): BotTarget {
  const rng = createRng(seed);
  const difficulty = 0.2 + rng() * 0.7;
  const balance = Math.round(500 + rng() * 3500);
  const nameIndex = Math.floor(rng() * BOT_NAMES.length);
  const taglineIndex = Math.floor(rng() * TAGLINES.length);
  const shortSeed = seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);

  const loadout = generateBotLoadout(seed, difficulty);
  loadout.effectiveScore = calculateSecurityScore(loadout);

  const securityScore = loadout.effectiveScore;
  const attackFee = calculateAttackFee(balance, securityScore, attackerBalance);
  const handle = `${BOT_NAMES[nameIndex]}${shortSeed}`;

  return {
    id: `${BOT_ID_PREFIX}${seed}`,
    seed,
    handle,
    balance,
    difficulty,
    loadout,
    securityScore,
    attackFee,
    difficultyBand: getDifficultyBand(securityScore),
    lootRange: getLootRange(balance),
    isBot: true,
    tagline: TAGLINES[taglineIndex],
  };
}
