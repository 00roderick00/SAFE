// POST /functions/v1/generate_game
//
// Body: {
//   prompt: string,
//   name: string,
//   statedDifficulty?: number,
//   mode?: 'engine_config' | 'dsl_program' (default: 'engine_config'),
//   baseEngine?: string   (required when mode='engine_config')
// }
//
// Flow:
//   1. Content moderation on title + prompt. Unsafe → persist a
//      `rejected` custom_games row with reason='moderation' and
//      short-circuit.
//   2. Route to the chosen mode:
//        - engine_config: Anthropic → validate against
//          ENGINE_SCHEMAS → 3A heuristic calibration.
//        - dsl_program: Anthropic → validateDsl → REAL headless
//          runs of the DSL runtime (calibrateDsl).
//   3. Persist a custom_games row. status=live iff calibration
//      passes; else rejected. Return the row + calibration.
//
// AI output is DATA in both modes — never executed as code.

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
import { validateDsl, DSL_LIMITS } from '../_shared/dsl.ts';
import { calibrateDsl } from '../_shared/dsl-runtime.ts';
import { moderate } from '../_shared/moderation.ts';
import { sanitizeUserText } from '../_shared/sanitize.ts';
import { suggestTweak } from '../_shared/suggestions.ts';

interface GenerateBody {
  prompt?: string;
  name?: string;
  statedDifficulty?: number;
  mode?: 'engine_config' | 'dsl_program';
  baseEngine?: string;
  /** When true, run the full pipeline (moderation → AI → validate →
   *  calibrate) but DO NOT persist a custom_games row. Used by the
   *  builder's "Preview difficulty" dry-run so creators can iterate. */
  dryRun?: boolean;
}

const MAX_PROMPT_LEN = 1000;
const MAX_NAME_LEN = 60;

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
  // Sanitize the title/description at write time so the DB never stores
  // markup, control chars, or a raw prompt-injection blob. `description`
  // is a cleaned slice of the prompt (not the raw prompt) — see
  // _shared/sanitize.ts + src/utils/sanitize.ts.
  const name = sanitizeUserText(body.name, { maxLength: MAX_NAME_LEN });
  const description = sanitizeUserText(prompt, { maxLength: 400 });
  const dryRun = body.dryRun === true;
  const mode = body.mode === 'dsl_program' ? 'dsl_program' : 'engine_config';
  const statedDifficulty = typeof body.statedDifficulty === 'number'
    ? Math.max(0, Math.min(1, body.statedDifficulty))
    : 0.5;

  if (!prompt || prompt.length > MAX_PROMPT_LEN) {
    return errorResponse('prompt_out_of_range', 400, { maxLength: MAX_PROMPT_LEN });
  }
  if (!name) return errorResponse('missing_name', 400);

  // ------- Moderation + quality gate (both modes) -----------------
  const mod = await moderate(name, prompt);
  const supabase = serviceClient();
  if (!mod.safe) {
    // Surface a creator-friendly reason for quality rejections.
    const rejectReason = mod.source === 'quality' ? mod.reason ?? 'low_quality' : 'moderation';
    // A dry-run never writes a row — just report why it was blocked.
    if (dryRun) {
      return jsonResponse({
        preview: true,
        customGame: null,
        calibration: { passes: false, reason: rejectReason, moderation: mod },
        moderation: mod,
      });
    }
    const { data: rejectedRow } = await supabase
      .from('custom_games')
      .insert({
        creator_id: userId,
        name,
        description,
        prompt,
        base_engine: mode === 'engine_config' ? (body.baseEngine ?? 'maze') : 'maze',
        mode,
        config: {},
        dsl_program: null,
        stated_difficulty: statedDifficulty,
        calibrated_difficulty: null,
        calibration_stats: {
          passes: false,
          reason: rejectReason,
          moderation: mod,
        },
        status: 'rejected',
      })
      .select()
      .single();
    return jsonResponse({
      customGame: rejectedRow,
      calibration: { passes: false, reason: rejectReason, moderation: mod },
      moderation: mod,
    });
  }

  // ------- Engine-config mode (3A) --------------------------------
  if (mode === 'engine_config') {
    const baseEngine = typeof body.baseEngine === 'string' ? body.baseEngine : '';
    if (!isSupportedEngine(baseEngine)) {
      return errorResponse('unsupported_engine', 400, {
        supported: Object.keys(ENGINE_SCHEMAS),
      });
    }
    const schema = ENGINE_SCHEMAS[baseEngine];
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
      `You configure minigames for SAFE. Emit ONE JSON object matching the requested engine's schema; NO markdown, NO fences, NO prose.\n\n` +
      `Engine: ${baseEngine} — ${schema.description}\n\nAllowed fields:\n${fieldSpec}\n\n` +
      `Stated difficulty: ${statedDifficulty.toFixed(2)}. Aim for a config a skilled player beats ~30-70% of the time; the server rejects anything outside that band.`;

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
    // Concrete "try this" nudge when the config missed the band.
    const suggestion = calibration.passes
      ? undefined
      : suggestTweak({ mode: 'engine_config', engine: baseEngine, config: validated.config, reason: calibration.reason });
    const calibrationOut = { ...calibration, suggestion };
    const status = calibration.passes ? 'live' : 'rejected';

    // Dry-run: report the calibration estimate without persisting.
    if (dryRun) {
      return jsonResponse({
        preview: true,
        customGame: null,
        calibration: calibrationOut,
        moderation: mod,
        aiRaw: raw.slice(0, 500),
      });
    }

    const { data: row, error: insertErr } = await supabase
      .from('custom_games')
      .insert({
        creator_id: userId,
        name,
        description,
        prompt,
        base_engine: baseEngine,
        mode: 'engine_config',
        config: validated.config,
        stated_difficulty: statedDifficulty,
        calibrated_difficulty: calibration.calibratedDifficulty,
        calibration_stats: { ...calibrationOut, moderation: mod },
        status,
      })
      .select()
      .single();
    if (insertErr || !row) {
      return errorResponse('custom_game_insert_failed', 500, { detail: insertErr?.message });
    }
    return jsonResponse({
      customGame: row,
      calibration: calibrationOut,
      moderation: mod,
      aiRaw: raw.slice(0, 500),
    });
  }

  // ------- DSL mode (3B) ------------------------------------------
  const dslSystemPrompt =
    `You design short 2D-grid minigames for SAFE. Output ONE JSON object matching the DSL schema; NO markdown, NO fences, NO prose.\n\n` +
    `Schema:\n` +
    `{\n` +
    `  "version": 1,\n` +
    `  "board": { "width": int ${DSL_LIMITS.boardMin}-${DSL_LIMITS.boardMax}, "height": int ${DSL_LIMITS.boardMin}-${DSL_LIMITS.boardMax} },\n` +
    `  "entities": [\n` +
    `    { "id": "player", "kind": "player", "x": int, "y": int, "movement": { "type": "input" } },\n` +
    `    // Optional additional entities (up to ${DSL_LIMITS.entityMax} total):\n` +
    `    { "id": "...", "kind": "wall" | "token" | "goal", "x": int, "y": int, "movement": { "type": "static" } },\n` +
    `    { "id": "...", "kind": "enemy", "x": int, "y": int, "movement": { "type": "random" | "chase", "speed": int ${DSL_LIMITS.speedMin}-${DSL_LIMITS.speedMax} } }\n` +
    `  ],\n` +
    `  "timeLimit": int ${DSL_LIMITS.timeLimitMin}-${DSL_LIMITS.timeLimitMax},\n` +
    `  "winCondition": "collect_all_tokens" | "reach_goal" | "survive"\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Exactly one player.\n` +
    `- All positions within board.\n` +
    `- No two entities on the same spawn cell.\n` +
    `- If winCondition=collect_all_tokens, include >= 1 token.\n` +
    `- If winCondition=reach_goal, include >= 1 goal.\n` +
    `- Stated difficulty: ${statedDifficulty.toFixed(2)}. Aim for a solve-rate in [0.30, 0.70]; the server rejects outside that band.`;

  let dslRaw: string;
  try {
    const res = await callAnthropic({
      system: dslSystemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
    });
    dslRaw = res.text;
  } catch (err) {
    return errorResponse('anthropic_call_failed', 502, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  let dslParsed: unknown;
  try {
    dslParsed = extractJsonObject(dslRaw);
  } catch {
    return errorResponse('anthropic_response_not_json', 502, { raw: dslRaw.slice(0, 400) });
  }

  const dslValidated = validateDsl(dslParsed);
  if (!dslValidated.ok) {
    return errorResponse('dsl_invalid', 422, { errors: dslValidated.errors });
  }

  const dslCalibration = calibrateDsl(dslValidated.program, {
    seedPrefix: `${userId}:${Date.now()}`,
  });
  const dslSuggestion = dslCalibration.passes
    ? undefined
    : suggestTweak({ mode: 'dsl_program', dsl: dslValidated.program, reason: dslCalibration.reason });
  const dslCalibrationOut = { ...dslCalibration, suggestion: dslSuggestion };
  const dslStatus = dslCalibration.passes ? 'live' : 'rejected';

  // Dry-run: report the real-runner solve-rate estimate + tweak without
  // persisting, so creators can iterate before publishing.
  if (dryRun) {
    return jsonResponse({
      preview: true,
      customGame: null,
      calibration: dslCalibrationOut,
      moderation: mod,
      aiRaw: dslRaw.slice(0, 800),
    });
  }

  const { data: dslRow, error: dslErr } = await supabase
    .from('custom_games')
    .insert({
      creator_id: userId,
      name,
      description,
      prompt,
      base_engine: 'maze', // nominal — DSL runtime drives gameplay
      mode: 'dsl_program',
      config: {},
      dsl_program: dslValidated.program,
      stated_difficulty: statedDifficulty,
      calibrated_difficulty: dslCalibration.calibratedDifficulty,
      calibration_stats: { ...dslCalibrationOut, moderation: mod },
      status: dslStatus,
    })
    .select()
    .single();
  if (dslErr || !dslRow) {
    return errorResponse('custom_game_insert_failed', 500, { detail: dslErr?.message });
  }

  return jsonResponse({
    customGame: dslRow,
    calibration: dslCalibrationOut,
    moderation: mod,
    aiRaw: dslRaw.slice(0, 800),
  });
});
