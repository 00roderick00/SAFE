// Content moderation for user-supplied title + prompt.
//
// One Anthropic call classifies the concatenated text as safe or
// unsafe under a small set of categories. Called from generate_game
// BEFORE the AI is asked to design a game — so unsafe prompts never
// produce a live custom_games row.
//
// A local block-list is applied first as a cheap, deterministic
// short-circuit (obvious slurs, personal-info leaks). Anything that
// passes the block-list is sent to Anthropic for the real check.

import { callAnthropic, extractJsonObject } from './anthropic.ts';
import { qualityCheck } from './sanitize.ts';

export type ModerationCategory =
  | 'clean'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'personal_info'
  | 'illegal'
  | 'low_quality'
  | 'other';

export interface ModerationResult {
  safe: boolean;
  category: ModerationCategory;
  reason?: string;
  source: 'blocklist' | 'quality' | 'ai' | 'fail_open';
}

// Small local block-list. Not exhaustive; the AI check is the real
// backstop. These are the strings we don't even want to pay AI
// tokens to look at.
const HARD_BLOCK = [
  /\b(kill\s+(myself|yourself|someone))\b/i,
  /\b(child|kid|minor)\s+porn/i,
  /\bcp\b/i,
  /\bssn\b|\bsocial\s+security\s+number\b/i,
  /credit\s*card\s*(number|#)/i,
];

export async function moderate(title: string, prompt: string): Promise<ModerationResult> {
  const combined = `${title}\n\n${prompt}`;

  for (const rx of HARD_BLOCK) {
    if (rx.test(combined)) {
      return {
        safe: false,
        category: 'other',
        reason: 'local_blocklist_match',
        source: 'blocklist',
      };
    }
  }

  // Deterministic quality gate (spam / garbage / mashed-key titles /
  // prompt-injection strings). Runs before we pay for an AI call.
  const quality = qualityCheck(title, prompt);
  if (!quality.ok) {
    return {
      safe: false,
      category: 'low_quality',
      reason: `low_quality:${quality.reason}`,
      source: 'quality',
    };
  }

  const system =
    'You are a strict content moderator for a mobile game platform. Classify the user\'s title+prompt into ONE category. Reply with ONLY a JSON object of shape ' +
    '{"safe": boolean, "category": "clean"|"hate"|"sexual"|"violence"|"personal_info"|"illegal"|"other", "reason"?: string}. ' +
    'Treat as UNSAFE: hate speech, sexual content, real-world personal info (SSN, addresses, phone numbers), instructions for illegal acts, or graphic violence. ' +
    'Treat game violence (e.g. "avoid the enemy") as SAFE. Nothing else.';

  try {
    const res = await callAnthropic({
      system,
      messages: [{ role: 'user', content: combined.slice(0, 2000) }],
      maxTokens: 120,
    });
    const parsed = extractJsonObject(res.text) as Record<string, unknown>;
    const safe = parsed.safe === true;
    const category = (typeof parsed.category === 'string' ? parsed.category : 'other') as ModerationCategory;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
    return { safe, category, reason, source: 'ai' };
  } catch (err) {
    // Fail-open, but flag it so the caller can decide policy. We
    // choose fail-open here because a Anthropic outage shouldn't
    // block the whole builder; the blocklist above catches the
    // worst cases.
    // eslint-disable-next-line no-console
    console.warn('[moderation] AI call failed, falling open', err);
    return { safe: true, category: 'clean', source: 'fail_open' };
  }
}
