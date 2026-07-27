// Progressive disclosure ladder (TACTILE-REDESIGN.md §3).
//
// The full feature set stays in the app; a new player just isn't shown
// all of it at once. Tiers are derived from play the server already
// records (settled attacks + wins), so progression is server-persistent
// by construction: useHydrateFromServer counts the user's attack rows
// and seeds these numbers on every fresh session. The client-side
// counters only provide instant feedback between hydrations.
//
// GATING IS PRESENTATION ONLY. Nothing here (or anywhere client-side)
// guards a server capability — a determined API caller can hit any
// endpoint at tier 0 and the security model does not care (see
// PROGRESS-SECURITY.md).

export type UnlockTier = 0 | 1 | 2 | 3;

export interface ProgressionCounters {
  /** Settled heists as the attacker — win, loss or abandon. */
  completedHeists: number;
  /** Won heists (first successful breach fast-tracks tier 3). */
  successfulHeists: number;
}

export type GatedSurface = 'security' | 'history' | 'insurance' | 'marketplace' | 'create';

export function getUnlockTier(p: ProgressionCounters): UnlockTier {
  if (p.completedHeists >= 5 || p.successfulHeists >= 1) return 3;
  if (p.completedHeists >= 3) return 2;
  if (p.completedHeists >= 1) return 1;
  return 0;
}

const SURFACE_TIER: Record<GatedSurface, UnlockTier> = {
  security: 1,
  history: 1,
  insurance: 2,
  marketplace: 2,
  create: 3,
};

export function isSurfaceUnlocked(surface: GatedSurface, tier: UnlockTier): boolean {
  return tier >= SURFACE_TIER[surface];
}

/** Player-facing copy for a tier's unlock condition — shown on locked
 *  surfaces so depth is visible before it's reachable. */
export const TIER_REQUIREMENTS: Record<Exclude<UnlockTier, 0>, string> = {
  1: 'Complete your first heist',
  2: 'Complete 3 heists',
  3: 'Complete 5 heists — or breach a safe',
};

export function requirementFor(surface: GatedSurface): string {
  return TIER_REQUIREMENTS[SURFACE_TIER[surface] as Exclude<UnlockTier, 0>];
}

/** What a tier newly unlocks (for the announcement moment). */
export const TIER_UNLOCKS: Record<Exclude<UnlockTier, 0>, { title: string; details: string }> = {
  1: { title: 'Security & History unlocked', details: 'Tune your locks in the full game picker and review every heist.' },
  2: { title: 'Insurance & Marketplace unlocked', details: 'Cover your losses and equip community-built locks.' },
  3: { title: 'Create unlocked', details: 'Build your own games in the AI Workshop and earn creator royalties.' },
};
