// Player-facing explanations for the stat readouts.
//
// Every number in this copy is INTERPOLATED FROM `ECONOMY` rather than
// typed in, so the help can never drift from the formulas in
// _shared/economy.ts. If a tunable changes, the copy changes with it —
// and statHelp.test.ts asserts the derivation both ways.
//
// Voice: plain, second person, one or two sentences. Say what the
// number means, and where it's actionable, how to move it.

import { ECONOMY } from './constants';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const tokens = (n: number) => n.toLocaleString();

/** The five attacker skills a loadout can cover (see catalog.ts). */
export const SKILL_COUNT = 5;

export const STAT_HELP = {
  // ---- Safe screen -------------------------------------------------
  balance: {
    title: 'Balance',
    body: `Tokens held in your safe. A single breach can take at most ${pct(ECONOMY.lootFraction)} of it, and your balance never drops below ${tokens(ECONOMY.principalFloor)} TK.`,
  },
  potentialLoss: {
    title: 'Potential loss',
    body: `The most one successful raid can take: ${pct(ECONOMY.lootFraction)} of your balance, capped at ${tokens(ECONOMY.lootCap)} TK. Raiders must crack every lock to collect it.`,
  },
  security: {
    title: 'Security',
    body: `Your locks' combined strength, 0–${ECONOMY.maxSecurityScore}. Difficulty counts exponentially, so pushing one lock higher beats adding a soft one — raise a lock's difficulty or fill a skill gap.`,
  },
  insurance: {
    title: 'Insurance',
    body: `Active cover refunds ${pct(ECONOMY.insurance.coverage)} of what a breach takes, up to your policy's max payout. Without it you absorb the whole loss.`,
  },

  // ---- Security screen ---------------------------------------------
  securityStrength: {
    title: 'Security strength',
    body: `Your locks' combined strength, 0–${ECONOMY.maxSecurityScore}. Each lock counts as its difficulty raised exponentially, so nudging one lock up is worth more than stacking easy ones.`,
  },
  potentialBreachLoss: {
    title: 'Potential breach loss',
    body: `What a raider takes if they crack all your locks: ${pct(ECONOMY.lootFraction)} of your balance, capped at ${tokens(ECONOMY.lootCap)} TK. One lock holding is enough to stop them.`,
  },
  skillCoverage: {
    title: 'Skill coverage',
    body: `How many of the ${SKILL_COUNT} attacker skills your locks test. Every gap is a specialist's free run — equip a lock that covers a missing skill.`,
  },

  // ---- Heist / attack confirmation ----------------------------------
  stake: {
    title: 'Stake',
    body: `What this raid costs you up front, from the target's balance and how easy its locks are. You forfeit it the moment one lock holds — and abandoning counts as a loss.`,
  },
  grossLoot: {
    title: 'Gross loot',
    body: `The full haul if every lock cracks: ${pct(ECONOMY.lootFraction)} of the target's balance, capped at ${tokens(ECONOMY.lootCap)} TK.`,
  },
  platformCut: {
    title: 'Platform cut',
    body: `The house takes ${pct(ECONOMY.platformCut)} of the gross loot on a win. Nothing is taken when you lose.`,
  },
  netWin: {
    title: 'Net win',
    body: `What actually lands in your safe: gross loot minus the ${pct(ECONOMY.platformCut)} platform cut. You only see it if all locks crack.`,
  },
} as const;

export type StatHelpKey = keyof typeof STAT_HELP;
