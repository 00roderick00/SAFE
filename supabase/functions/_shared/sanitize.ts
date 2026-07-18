// Server-side sanitizer + quality gate for user-supplied custom-game
// titles and descriptions. Runs at WRITE time in generate_game so the
// database never stores markup, control/zero-width characters, or
// obvious spam/garbage — the client-side src/utils/sanitize.ts mirrors
// the sanitizer for defense-in-depth at DISPLAY time.

// C0/C1 control chars (0x00-0x1F, 0x7F). Built via RegExp so the source
// stays ASCII-clean. Stripping control chars is the intent, so the
// no-control-regex rule is intentionally disabled for this line.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f]', 'g');
// Zero-width + bidi-override characters used to hide/spoof content.
const INVISIBLE = new RegExp('[\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
const ANGLE_TAGS = /<[^>]*>/g;

export interface SanitizeOptions {
  maxLength?: number;
}

/** Strip markup/control/invisible chars, collapse whitespace, length-cap. */
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

// ---------------------------------------------------------------
// Quality gate. Rejects titles/prompts that are spam, garbage, or
// prompt-injection noise — the sort of listing the marketplace should
// never surface. This is deterministic and runs BEFORE any AI call.
// ---------------------------------------------------------------

export type QualityReason =
  | 'title_too_short'
  | 'title_no_letters'
  | 'title_repetitive'
  | 'prompt_too_short'
  | 'injection_like';

export interface QualityResult {
  ok: boolean;
  reason?: QualityReason;
  detail?: string;
}

// Phrases that read as prompt-injection / instruction-hijack attempts.
// The AI pipeline already neutralizes these for config-building, but a
// listing whose *title or prompt* is an injection string is garbage and
// shouldn't be published.
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above|your)\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\breturn\s*[{[]/i,
  /\boutput\s+(the\s+)?(json|following)\b/i,
];

const MIN_TITLE_LEN = 3;
const MIN_PROMPT_LEN = 8;

/** Longest run of the same character as a fraction of length. */
function maxCharRunFraction(s: string): number {
  if (!s.length) return 0;
  let max = 1;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    run = s[i] === s[i - 1] ? run + 1 : 1;
    if (run > max) max = run;
  }
  return max / s.length;
}

/** Fraction of characters that are distinct — low = highly repetitive. */
function distinctFraction(s: string): number {
  const compact = s.replace(/\s+/g, '');
  if (!compact.length) return 1;
  return new Set(compact.toLowerCase()).size / compact.length;
}

/**
 * Reject obvious junk. Conservative on purpose: this catches empty /
 * symbol-only / mashed-key / injection-string listings without
 * second-guessing legitimate creative titles.
 */
export function qualityCheck(rawTitle: string, rawPrompt: string): QualityResult {
  const title = sanitizeUserText(rawTitle, { maxLength: 60 });
  const prompt = sanitizeUserText(rawPrompt, { maxLength: 1000 });

  if (title.length < MIN_TITLE_LEN) {
    return { ok: false, reason: 'title_too_short', detail: `min ${MIN_TITLE_LEN} chars` };
  }
  if (!/[a-z0-9]/i.test(title)) {
    return { ok: false, reason: 'title_no_letters', detail: 'needs letters or digits' };
  }
  // "aaaaaaa" / "!!!!!!" / "asdasdasdasd" style noise. Only trip on
  // longer titles so short real names ("GG", "Go!") pass.
  if (title.length >= 6 && (maxCharRunFraction(title) >= 0.6 || distinctFraction(title) < 0.3)) {
    return { ok: false, reason: 'title_repetitive', detail: 'looks like keyboard mash' };
  }
  if (prompt.length < MIN_PROMPT_LEN) {
    return { ok: false, reason: 'prompt_too_short', detail: `min ${MIN_PROMPT_LEN} chars` };
  }

  const combined = `${title}\n${prompt}`;
  for (const rx of INJECTION_PATTERNS) {
    if (rx.test(combined)) {
      return { ok: false, reason: 'injection_like', detail: 'reads as a prompt-injection string' };
    }
  }

  return { ok: true };
}
