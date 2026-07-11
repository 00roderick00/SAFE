// POST /functions/v1/generate_game
//
// Body: { prompt: string, baseEngine: string, name?: string,
//         statedDifficulty?: number }
//
// 1. Ask Anthropic (server-side, using ANTHROPIC_API_KEY secret)
//    to emit a JSON config that fits ENGINE_SCHEMAS[baseEngine].
// 2. Validate the response against the schema. Reject anything
//    out of range. AI output is DATA — never executed.
// 3. Calibrate: run the per-engine solve-rate simulator. If the
//    result lands in the target band, mark the row `live`; if
//    not, mark it `rejected` so it cannot guard a safe.
// 4. Persist a row in `custom_games` and return it.
//
// The endpoint always returns a row (even on calibration failure)
// so the client can show WHY it was rejected.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { callAnthropic, extractJsonObject } from '../_shared/anthropic.ts';
import { ENGINE_SCHEMAS, validateConfig, isSupportedEngine } from '../_shared/config-schemas.ts';
import { calibrate } from '../_shared/calibration.ts';

interface GenerateBody {
  prompt?: string;
  baseEngine?: string;
  name?: string;
  statedDifficulty?: number;
}

const MAX_PROMPT_LEN = 1000;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('bad_json');
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const baseEngine = typeof body.baseEngine === 'string' ? body.baseEngine : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const statedDifficulty = typeof body.statedDifficulty === 'number'
    ? Math.max(0, Math.min(1, body.statedDifficulty))
    : 0.5;

  if (!prompt || prompt.length > MAX_PROMPT_LEN) {
    return errorResponse('prompt_out_of_range', 400, { maxLength: MAX_PROMPT_LEN });
  }
  if (!isSupportedEngine(baseEngine)) {
    return errorResponse('unsupported_engine', 400, {
      supported: Object.keys(ENGINE_SCHEMAS),
    });
  }
  if (!name) return errorResponse('missing_name', 400);

  const schema = ENGINE_SCHEMAS[baseEngine];

  // Build the AI prompt. Keep it short + strict: describe the
  // engine, list the exact JSON keys the model may set (with types
  // + ranges), and demand a bare JSON object with no prose.
  const fieldSpec = Object.entries(schema.fields)
    .map(([key, field]) => {
      if (field.type === 'integer' || field.type === 'number') {
        const range = `min ${field.min ?? '-∞'}, max ${field.max ?? '∞'}`;
        return `- "${key}": ${field.type} (${range})${schema.required.includes(key) ? ' [required]' : ''}`;
      }
      if (field.type === 'string') {
        const opts = field.enum ? ` one of [${field.enum.join(', ')}]` : '';
        return `- "${key}": string${opts}${schema.required.includes(key) ? ' [required]' : ''}`;
      }
      if (field.type === 'boolean') {
        return `- "${key}": boolean${schema.required.includes(key) ? ' [required]' : ''}`;
      }
      if (field.type === 'array') {
        return `- "${key}": array of ${field.item.type}${schema.required.includes(key) ? ' [required]' : ''}`;
      }
      return `- "${key}": ${JSON.stringify(field)}`;
    })
    .join('\n');

  const systemPrompt =
    `You configure minigames for the SAFE game platform. You emit ONE JSON object matching the requested engine's schema, and NOTHING ELSE — no markdown, no prose, no fenced blocks.\n\n` +
    `Engine: ${baseEngine} — ${schema.description}\n\n` +
    `Allowed fields:\n${fieldSpec}\n\n` +
    `Stated difficulty target: ${statedDifficulty.toFixed(2)} (0=trivial, 1=impossible). Aim for a config that a skilled player solves ~30-70% of the time; the server rejects anything outside that band.`;

  let raw: string;
  try {
    const res = await callAnthropic({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
    });
    raw = res.text;
  } catch (err) {
    return errorResponse('anthropic_call_failed', 502, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  let parsed: unknown;
  try {
    parsed = extractJsonObject(raw);
  } catch {
    return errorResponse('anthropic_response_not_json', 502, { raw: raw.slice(0, 400) });
  }

  const validated = validateConfig(baseEngine, parsed);
  if (!validated.ok) {
    return errorResponse('config_invalid', 422, { errors: validated.errors });
  }

  const calibration = calibrate(baseEngine, validated.config, {
    seed: `${userId}:${Date.now()}`,
  });

  const status = calibration.passes ? 'live' : 'rejected';

  const supabase = serviceClient();
  const { data: row, error: insertErr } = await supabase
    .from('custom_games')
    .insert({
      creator_id: userId,
      name,
      description: prompt.slice(0, 400),
      prompt,
      base_engine: baseEngine,
      config: validated.config,
      stated_difficulty: statedDifficulty,
      calibrated_difficulty: calibration.calibratedDifficulty,
      calibration_stats: calibration,
      status,
    })
    .select()
    .single();

  if (insertErr || !row) {
    return errorResponse('custom_game_insert_failed', 500, {
      detail: insertErr?.message,
    });
  }

  return jsonResponse({
    customGame: row,
    calibration,
    aiRaw: raw.slice(0, 500), // for debugging / display; NOT re-executed
  });
});
