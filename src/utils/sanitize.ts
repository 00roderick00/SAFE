// Display-side sanitizer for user-supplied text (custom-game names &
// descriptions). React already escapes text nodes, so this is
// defense-in-depth: it strips control/zero-width characters, drops any
// angle-bracket HTML, collapses runaway whitespace, and length-caps —
// so a stored prompt-injection string or garbage blob can't render as
// markup, blow out the layout, or smuggle in invisible characters.
//
// This mirrors supabase/functions/_shared/sanitize.ts (server enforces
// the same rules at write time); keep the two in sync.

// C0/C1 control chars (0x00-0x1F, 0x7F). Built via RegExp so the source
// stays ASCII-clean. Stripping control chars is the whole point here, so
// the no-control-regex rule is intentionally disabled for this line.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f]', 'g');
// Zero-width + bidi-override characters used to hide/spoof content.
const INVISIBLE = new RegExp('[\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
const ANGLE_TAGS = /<[^>]*>/g;

export interface SanitizeOptions {
  maxLength?: number;
}

/**
 * Normalize a single line of user text for safe display. Removes HTML
 * tags, control/invisible characters, and collapses whitespace to
 * single spaces. Returns a trimmed, length-capped string.
 */
export function sanitizeUserText(input: unknown, opts: SanitizeOptions = {}): string {
  if (typeof input !== 'string') return '';
  const maxLength = opts.maxLength ?? 200;
  const cleaned = input
    .replace(ANGLE_TAGS, ' ')
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}
