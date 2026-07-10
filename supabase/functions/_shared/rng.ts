// Seedable, deterministic RNG. Edge Functions own the seed;
// the client can replay it (for scoring / replay UX) but cannot
// tilt outcomes without the seed matching.
//
// Implementation: xmur3 → mulberry32. Cheap, decent statistical
// quality for gameplay RNG. NOT cryptographically secure; do not
// use for anything security-sensitive.

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a deterministic pseudo-random generator from a string seed.
 * Returns a function that yields floats in [0, 1) — same interface
 * as Math.random, so the config-generation helpers in modules.ts
 * can drop it in.
 */
export function createRng(seed: string): () => number {
  const hash = xmur3(seed)();
  return mulberry32(hash);
}

/**
 * Convenience: fresh URL-safe seed string. Server-only; the client
 * should never call this — seeds arrive from the server.
 */
export function newSeed(prefix = ''): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) =>
    c === '+' ? '-' : c === '/' ? '_' : ''
  );
  return prefix ? `${prefix}_${b64}` : b64;
}
