/**
 * Defence watching is presentation only, and must not run when the
 * player isn't at risk (no background battery drain).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { useDefenseWatch, DEFENSE_POLL_MS } from './useDefenseWatch';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { buildDefenseEventFromAttack } from '../game/history';
import type { DefenseTickPayload, ResolvedAttack } from './api';

/** Flush pending promises AND timers. `waitFor` polls on real timers,
 *  which deadlocks against fake ones, so advance explicitly. */
const flush = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

const resolveDefense = vi.fn<[string | undefined], Promise<DefenseTickPayload>>();
vi.mock('./api', () => ({ api: { resolveDefense: (s?: string) => resolveDefense(s) } }));

const SESSION = { user: { id: 'me' } } as unknown as Session;

const payload = (over: Partial<DefenseTickPayload> = {}): DefenseTickPayload => ({
  checkedAt: '2026-08-02T10:00:00.000Z',
  exposed: true,
  exposedUntil: '2026-08-02T10:10:00.000Z',
  balance: 1000,
  inFlight: [],
  resolved: [],
  ...over,
});

const RESOLVED: ResolvedAttack = {
  attackId: 'atk-1',
  attackerHandle: 'trevor.mentis',
  status: 'lost', // attacker lost → we held
  resolvedAt: '2026-08-02T09:59:00.000Z',
  stake: 40,
  loot: 0,
  lootLost: 0,
  feeEarned: 40,
};

beforeEach(() => {
  vi.useFakeTimers();
  resolveDefense.mockReset();
  resolveDefense.mockResolvedValue(payload());
  usePlayerStore.getState().resetPlayer();
  useGameStore.setState({ defenseHistory: [], notifications: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('polling only while exposed', () => {
  it('does not poll at all when not in heist mode', () => {
    usePlayerStore.setState({ heistModeActive: false });
    renderHook(() => useDefenseWatch(SESSION));
    act(() => { vi.advanceTimersByTime(DEFENSE_POLL_MS * 4); });
    expect(resolveDefense).not.toHaveBeenCalled();
  });

  it('does not poll when signed out, even if the local flag says exposed', () => {
    usePlayerStore.setState({ heistModeActive: true });
    renderHook(() => useDefenseWatch(null));
    act(() => { vi.advanceTimersByTime(DEFENSE_POLL_MS * 4); });
    expect(resolveDefense).not.toHaveBeenCalled();
  });

  it('polls while exposed', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    renderHook(() => useDefenseWatch(SESSION));
    await flush();
    expect(resolveDefense).toHaveBeenCalledTimes(1);
    await flush(DEFENSE_POLL_MS);
    expect(resolveDefense.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('STOPS polling the moment exposure ends', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    const { rerender } = renderHook(() => useDefenseWatch(SESSION));
    await flush();
    expect(resolveDefense).toHaveBeenCalled();
    const callsWhileExposed = resolveDefense.mock.calls.length;

    act(() => { usePlayerStore.setState({ heistModeActive: false }); });
    rerender();
    await flush(DEFENSE_POLL_MS * 5);

    expect(resolveDefense.mock.calls.length).toBe(callsWhileExposed);
  });

  it('unmounting clears the interval', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    const { unmount } = renderHook(() => useDefenseWatch(SESSION));
    await flush();
    const before = resolveDefense.mock.calls.length;
    unmount();
    await flush(DEFENSE_POLL_MS * 5);
    expect(resolveDefense.mock.calls.length).toBe(before);
  });
});

describe('reports only genuine attacks', () => {
  it('surfaces in-flight raids for the live warning', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    resolveDefense.mockResolvedValue(payload({
      inFlight: [{ attackId: 'a1', attackerHandle: 'trevor.mentis', startedAt: '2026-08-02T09:59:30.000Z', elapsedSeconds: 30, lockCount: 3 }],
    }));
    const { result } = renderHook(() => useDefenseWatch(SESSION));
    await flush();
    expect(result.current.inFlight).toHaveLength(1);
    expect(result.current.inFlight[0].attackerHandle).toBe('trevor.mentis');
  });

  it('an empty report produces no history and no notification', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    renderHook(() => useDefenseWatch(SESSION));
    await flush(DEFENSE_POLL_MS * 3);
    expect(useGameStore.getState().defenseHistory).toHaveLength(0);
    expect(useGameStore.getState().notifications).toHaveLength(0);
  });

  it('a failed poll never invents an outcome', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    resolveDefense.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useDefenseWatch(SESSION));
    await flush(DEFENSE_POLL_MS * 2);
    expect(useGameStore.getState().defenseHistory).toHaveLength(0);
    expect(result.current.inFlight).toEqual([]);
    warn.mockRestore();
  });
});

describe('defence events land in the defender History', () => {
  it('writes a settled attack to History with the attacker handle and outcome', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    resolveDefense.mockResolvedValue(payload({ resolved: [RESOLVED] }));
    renderHook(() => useDefenseWatch(SESSION));
    await flush();

    expect(useGameStore.getState().defenseHistory).toHaveLength(1);
    const event = useGameStore.getState().defenseHistory[0];
    expect(event.attackerName).toBe('trevor.mentis');
    expect(event.success).toBe(true); // we held
    expect(event.feeEarned).toBe(40);
    expect(event.lootLost).toBe(0);
  });

  it('re-reporting the same attack does not duplicate it', async () => {
    usePlayerStore.setState({ heistModeActive: true });
    resolveDefense.mockResolvedValue(payload({ resolved: [RESOLVED] }));
    renderHook(() => useDefenseWatch(SESSION));
    await flush();
    expect(useGameStore.getState().defenseHistory).toHaveLength(1);
    await flush(DEFENSE_POLL_MS * 3);
    expect(useGameStore.getState().defenseHistory).toHaveLength(1);
  });

  it('a breach is recorded as a loss for the defender', () => {
    const breached = buildDefenseEventFromAttack({
      ...RESOLVED, attackId: 'atk-2', status: 'won', loot: 300, lootLost: 300, feeEarned: 0,
    });
    expect(breached.success).toBe(false);
    expect(breached.lootLost).toBe(300);
    expect(breached.id).toBe('defense-atk-2');
  });
});
