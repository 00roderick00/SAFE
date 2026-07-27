// React bindings for the progressive-disclosure ladder (§3).
// Kept out of progression.ts so that module stays pure.

import { usePlayerStore } from './playerStore';
import { getUnlockTier, isSurfaceUnlocked, type GatedSurface, type UnlockTier } from '../game/progression';

export function useUnlockTier(): UnlockTier {
  const completedHeists = usePlayerStore((s) => s.completedHeists);
  const successfulHeists = usePlayerStore((s) => s.successfulHeists);
  return getUnlockTier({ completedHeists, successfulHeists });
}

export function useSurfaceUnlocked(surface: GatedSurface): boolean {
  return isSurfaceUnlocked(surface, useUnlockTier());
}
