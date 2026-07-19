/**
 * Render smoke test for every minigame in the registry. This would have
 * caught the Phase-1 crash where AttackScreen tried to render module
 * types that generateMiniGameConfig threw for.
 *
 * We aren't asserting gameplay — just that mounting each one with the
 * canonical `{ difficulty, seed, onComplete }` contract does not throw.
 */
import { Suspense } from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MINIGAME_REGISTRY } from './registry';
import type { ModuleType } from '../../types';

// A number of minigames use requestAnimationFrame or timers. Happy-DOM
// provides both, but noop them for the smoke test to avoid warnings and
// keep the render tick synchronous.
beforeAll(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)) as typeof requestAnimationFrame
  );
  vi.stubGlobal('cancelAnimationFrame', ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const registeredTypes = Object.keys(MINIGAME_REGISTRY) as ModuleType[];

describe('MINIGAME_REGISTRY', () => {
  it('has an entry for every non-custom module type', () => {
    // 36 game modules; custom is intentionally not in the registry
    // (it renders through the AI builder in Phase 3).
    expect(registeredTypes.length).toBe(36);
  });
});

describe.each(registeredTypes)('minigame smoke: %s', (type) => {
  it('loads, mounts, and unmounts without throwing', async () => {
    const Component = MINIGAME_REGISTRY[type]!;
    const onComplete = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { unmount } = render(
        <Suspense fallback={<div>loading</div>}>
          <div data-testid="loaded-game"><Component difficulty={0.5} seed={`smoke-${type}`} onComplete={onComplete} /></div>
        </Suspense>
      );
      expect(await screen.findByTestId('loaded-game')).toBeInTheDocument();
      unmount();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
