// Config schemas + tiny validator for AI-generated minigame configs.
//
// Every custom game targets one of the built-in engines (its
// `baseEngine`). The engine's schema defines every field the AI is
// allowed to set, its type, and its allowed range. Anything outside
// the schema is rejected server-side — AI output is data, never
// code, and never trusted before validation.
//
// Deliberately does NOT use ajv or any JSON-Schema library. The
// surface we need is small and predictable; a hand-rolled validator
// keeps the Deno bundle tiny and avoids esm.sh compat surprises.

import type { ModuleType } from './types.ts';

export type FieldSchema =
  | {
      type: 'integer' | 'number';
      min?: number;
      max?: number;
      default?: number;
    }
  | {
      type: 'boolean';
      default?: boolean;
    }
  | {
      type: 'string';
      enum?: readonly string[];
      minLength?: number;
      maxLength?: number;
      default?: string;
    }
  | {
      type: 'array';
      minItems?: number;
      maxItems?: number;
      item: FieldSchema;
    };

export interface EngineSchema {
  engine: ModuleType;
  /** Prose summary handed to the AI so it knows what the game does. */
  description: string;
  fields: Record<string, FieldSchema>;
  /** Which fields the AI must provide (others use defaults). */
  required: readonly string[];
}

// ---------------------------------------------------------------
// Schemas. Kept intentionally focused: 6 well-understood engines.
// ---------------------------------------------------------------

export const ENGINE_SCHEMAS: Record<string, EngineSchema> = {
  maze: {
    engine: 'maze',
    description: 'Grid maze the player must traverse from entry to exit within a time limit.',
    fields: {
      gridSize: { type: 'integer', min: 5, max: 15, default: 9 },
      timeLimit: { type: 'integer', min: 15, max: 90, default: 30 },
      theme: { type: 'string', enum: ['neon', 'circuit', 'stone', 'ice'], default: 'neon' },
    },
    required: ['gridSize', 'timeLimit'],
  },

  snake: {
    engine: 'snake',
    description: 'Steer a growing snake to eat targets, reaching a length threshold before the timer runs out.',
    fields: {
      boardSize: { type: 'integer', min: 8, max: 20, default: 12 },
      speed: { type: 'integer', min: 1, max: 5, default: 3 },
      targetLength: { type: 'integer', min: 5, max: 25, default: 12 },
      timeLimit: { type: 'integer', min: 20, max: 90, default: 45 },
    },
    required: ['boardSize', 'targetLength', 'timeLimit'],
  },

  timing: {
    engine: 'timing',
    description: 'Stop the rotating needle within the target zone.',
    fields: {
      rotationSpeed: { type: 'integer', min: 60, max: 360, default: 180 },
      targetZoneSize: { type: 'integer', min: 12, max: 60, default: 24 },
      attemptsAllowed: { type: 'integer', min: 1, max: 5, default: 3 },
    },
    required: ['rotationSpeed', 'targetZoneSize', 'attemptsAllowed'],
  },

  pattern: {
    engine: 'pattern',
    description: 'Memorise a pattern of connected dots on a grid, then reproduce it.',
    fields: {
      gridSize: { type: 'integer', min: 3, max: 5, default: 4 },
      requiredLength: { type: 'integer', min: 4, max: 9, default: 6 },
      timeLimit: { type: 'integer', min: 8, max: 30, default: 15 },
      memorizeTime: { type: 'integer', min: 1500, max: 5000, default: 2500 },
    },
    required: ['gridSize', 'requiredLength', 'timeLimit'],
  },

  memorymatch: {
    engine: 'memorymatch',
    description: 'Flip cards to find matching pairs before the timer expires.',
    fields: {
      pairCount: { type: 'integer', min: 4, max: 12, default: 8 },
      memorizeTime: { type: 'integer', min: 2000, max: 6000, default: 3500 },
      timeLimit: { type: 'integer', min: 20, max: 90, default: 45 },
    },
    required: ['pairCount', 'timeLimit'],
  },

  quickmath: {
    engine: 'quickmath',
    description: 'Solve a series of arithmetic problems before the timer runs out.',
    fields: {
      problemCount: { type: 'integer', min: 5, max: 20, default: 10 },
      operations: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        item: { type: 'string', enum: ['add', 'sub', 'mul', 'div'] },
      },
      timeLimit: { type: 'integer', min: 20, max: 90, default: 45 },
      allowNegatives: { type: 'boolean', default: false },
    },
    required: ['problemCount', 'operations', 'timeLimit'],
  },
};

export function isSupportedEngine(engine: string): engine is keyof typeof ENGINE_SCHEMAS {
  return Object.prototype.hasOwnProperty.call(ENGINE_SCHEMAS, engine);
}

// ---------------------------------------------------------------
// Validator.
// ---------------------------------------------------------------

export type ValidationResult<T = Record<string, unknown>> =
  | { ok: true; config: T }
  | { ok: false; errors: string[] };

function validateField(
  value: unknown,
  schema: FieldSchema,
  path: string,
  errors: string[]
): unknown {
  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path}: expected ${schema.type}, got ${typeof value}`);
      return undefined;
    }
    let n = value;
    if (schema.type === 'integer') n = Math.round(n);
    if (schema.min !== undefined && n < schema.min) {
      errors.push(`${path}: below min ${schema.min}`);
      return undefined;
    }
    if (schema.max !== undefined && n > schema.max) {
      errors.push(`${path}: above max ${schema.max}`);
      return undefined;
    }
    return n;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${path}: expected boolean`);
      return undefined;
    }
    return value;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected string`);
      return undefined;
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: not in enum (${schema.enum.join('|')})`);
      return undefined;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength}`);
      return undefined;
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than ${schema.maxLength}`);
      return undefined;
    }
    return value;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return undefined;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} items`);
      return undefined;
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: more than ${schema.maxItems} items`);
      return undefined;
    }
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const v = validateField(value[i], schema.item, `${path}[${i}]`, errors);
      if (v === undefined) return undefined;
      out.push(v);
    }
    return out;
  }

  errors.push(`${path}: unsupported schema`);
  return undefined;
}

/**
 * Validate a raw AI-emitted config against the engine's schema.
 * On success, returns a config with every field either supplied by
 * the AI (and range-checked) or filled in from `schema.default`.
 * On failure, returns the list of complaints.
 */
export function validateConfig(engine: string, raw: unknown): ValidationResult {
  const schema = ENGINE_SCHEMAS[engine];
  if (!schema) return { ok: false, errors: [`unknown engine: ${engine}`] };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['config must be a JSON object'] };
  }

  const errors: string[] = [];
  const rawObj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(schema.fields)) {
    if (Object.prototype.hasOwnProperty.call(rawObj, key)) {
      const v = validateField(rawObj[key], fieldSchema, key, errors);
      if (v !== undefined) out[key] = v;
    } else if (schema.required.includes(key)) {
      errors.push(`${key}: required`);
    } else if ('default' in fieldSchema && fieldSchema.default !== undefined) {
      out[key] = fieldSchema.default;
    }
  }

  // Reject any unexpected fields — narrows the AI's surface area
  // and catches prompt injections trying to smuggle in extra keys.
  for (const key of Object.keys(rawObj)) {
    if (!(key in schema.fields)) {
      errors.push(`${key}: unknown field for engine ${engine}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: out };
}
