// Client-side marketplace listing safety (Section 9), defense-in-depth.
//
// The server moderates names/prompts at write time (see
// supabase/functions/_shared/sanitize.ts qualityCheck). This is the
// SECOND line of defense at DISPLAY time: even if an unsafe/test row
// slipped through earlier (e.g. the "Inject" listing whose description
// was a raw prompt-injection string), the marketplace and picker hide it
// so calibration success alone can never make unsafe content publicly
// visible. All shown text is additionally passed through sanitizeUserText.

import { sanitizeUserText } from '../utils/sanitize';

// Reads-as-injection / instruction-hijack, code fences, and
// destructive-command fragments. Kept in sync with the server patterns.
const UNSAFE_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(all\s+|the\s+)?(previous|prior|above|instructions)\b/i,
  /\b(system|developer|assistant)\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\breturn\s+(only\s+)?(the\s+)?(json|\{)/i,
  /\{\s*["']?\s*gridsize/i, // the specific "Inject" payload shape
  /```|<\/?script|rm\s+-rf|drop\s+table|;\s*--|\bexec\s*\(/i, // code / destructive
];

export type ListingReason = 'empty' | 'garbage' | 'injection';
export interface ListingSafety {
  safe: boolean;
  reason?: ListingReason;
}

/** Decide whether a community listing is safe to show publicly. */
export function checkListingSafety(name: unknown, description: unknown): ListingSafety {
  const cleanName = sanitizeUserText(name, { maxLength: 80 });
  const cleanDesc = sanitizeUserText(description, { maxLength: 400 });
  if (cleanName.length < 2) return { safe: false, reason: 'empty' };
  if (!/[a-z]/i.test(cleanName)) return { safe: false, reason: 'garbage' };
  const combined = `${cleanName}\n${cleanDesc}`;
  for (const rx of UNSAFE_PATTERNS) {
    if (rx.test(combined)) return { safe: false, reason: 'injection' };
  }
  return { safe: true };
}

/** True when the listing may appear in public surfaces (marketplace, picker). */
export function isDisplayableListing(game: { name?: unknown; description?: unknown }): boolean {
  return checkListingSafety(game?.name, game?.description).safe;
}

/** Filter a list of listings down to the displayable ones. */
export function filterDisplayableListings<T extends { name?: unknown; description?: unknown }>(games: T[]): T[] {
  return games.filter(isDisplayableListing);
}
