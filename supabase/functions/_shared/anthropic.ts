// Thin Anthropic Messages API client for Edge Functions.
//
// The ANTHROPIC_API_KEY is a Supabase Edge Function secret — read
// via Deno.env.get, never bundled to the client, never persisted
// anywhere else. Set with:
//
//   supabase secrets set ANTHROPIC_API_KEY=<key>
//
// Anthropic requires a specific version header; the model is
// selectable per-call (default: haiku-4.5, cheap + fast + more than
// enough for generating a JSON config).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicCallInput {
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: AnthropicMessage[];
}

export interface AnthropicCallOutput {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  model: string;
  stopReason?: string;
}

export function anthropicKey(): string {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('missing_anthropic_key');
  return key;
}

export async function callAnthropic(input: AnthropicCallInput): Promise<AnthropicCallOutput> {
  const key = anthropicKey();
  const body = {
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: input.maxTokens ?? 800,
    system: input.system,
    messages: input.messages,
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`anthropic_${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  // Anthropic returns { content: [{ type: 'text', text: '...' }, ...], usage, ... }
  const text = Array.isArray(json.content)
    ? json.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('')
    : '';
  return {
    text,
    usage: json.usage,
    model: json.model ?? body.model,
    stopReason: json.stop_reason,
  };
}

/**
 * Extract a JSON object from the model's raw text. Handles the
 * common shapes: bare JSON, JSON inside a fenced code block, and
 * mixed prose + JSON. Throws if no valid object can be recovered.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();

  // Try the whole string first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // Fenced code block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }

  // First balanced object.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through
    }
  }

  throw new Error('anthropic_response_not_json');
}
