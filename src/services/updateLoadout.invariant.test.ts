/**
 * WRITE-PATH INVARIANT: no safe may ever store a retired module type.
 *
 * A one-shot backfill is not an invariant — roderick.jones's safe came
 * back with `pacman` after the first one. Every loadout write funnels
 * through api.updateLoadout, so it normalizes there; the DB trigger
 * (migrations/20260727230000) enforces the same rule for any client
 * that bypasses this path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SecurityLoadout, SecurityModule } from '../types';

const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const from = vi.fn().mockReturnValue({ update });

vi.mock('./supabaseClient', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));

const { api } = await import('./api');

const written = (): SecurityLoadout => update.mock.calls[0][0].security_loadout;

beforeEach(() => {
  update.mockClear();
  from.mockClear();
});

describe('api.updateLoadout normalizes retired types before writing', () => {
  it('rewrites a retired built-in', async () => {
    const loadout: SecurityLoadout = {
      effectiveScore: 10,
      modules: [
        { id: 'a', type: 'snake', difficulty: 0.3, weight: 1, name: 'Circuit Trail', description: 'x' },
        { id: 'b', type: 'keypad', difficulty: 0.3, weight: 1, name: 'Keypad', description: 'y' },
      ],
    };
    await api.updateLoadout('u1', loadout);
    expect(written().modules.map((m) => m.type)).toEqual(['maze', 'keypad']);
  });

  it("rewrites roderick.jones's exact reintroduced loadout, without duplicating maze", async () => {
    const dsl = { mode: 'dsl_program' as const, config: { version: 1 }, baseEngine: 'maze' as SecurityModule['type'] };
    const loadout: SecurityLoadout = {
      effectiveScore: 29.48,
      modules: [
        { id: 'cg-slot-0', type: 'pacman', difficulty: 0.3, weight: 1.2, name: 'Pac-Man', description: 'x', customGameId: 'cg', customConfig: dsl },
        { id: 'cg-slot-1', type: 'quickmath', difficulty: 0.3, weight: 1, name: 'Math', description: 'y', customGameId: 'cg', customConfig: dsl },
        { id: 'm-2', type: 'maze', difficulty: 0.3, weight: 1, name: 'Maze', description: 'z' },
      ],
    };
    await api.updateLoadout('u1', loadout);
    const types = written().modules.map((m) => m.type);
    expect(types).toEqual(['breakout', 'quickmath', 'maze']);
    expect(new Set(types).size).toBe(3);
    // Still a playable custom game after the write.
    expect(written().modules[0].customGameId).toBe('cg');
    expect(written().modules[0].customConfig?.mode).toBe('dsl_program');
  });

  it('passes a clean loadout through untouched', async () => {
    const loadout: SecurityLoadout = {
      effectiveScore: 12,
      modules: [{ id: 'a', type: 'keypad', difficulty: 0.3, weight: 1, name: 'Keypad', description: 'y' }],
    };
    await api.updateLoadout('u1', loadout);
    expect(written()).toEqual(loadout);
  });
});
