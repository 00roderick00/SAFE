import { describe, it, expect } from 'vitest';
import { moderate } from './moderation';

// These cases hit only the local blocklist path — no network call.
// The AI path is covered by the higher-level generate_game round-trip
// tests via mocking.

describe('moderate (blocklist)', () => {
  it('blocks a clear CSAM keyword', async () => {
    const r = await moderate('kids', 'child porn maze');
    expect(r.safe).toBe(false);
    expect(r.source).toBe('blocklist');
    expect(r.category).toBe('other');
  });

  it('blocks personal info leak (SSN)', async () => {
    const r = await moderate('game', 'store the ssn 123-45-6789 as the code');
    expect(r.safe).toBe(false);
    expect(r.source).toBe('blocklist');
  });

  it('blocks credit-card wording', async () => {
    const r = await moderate('challenge', 'user must enter credit card number');
    expect(r.safe).toBe(false);
    expect(r.source).toBe('blocklist');
  });
});
