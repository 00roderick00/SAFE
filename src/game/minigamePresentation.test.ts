import { describe, expect, it } from 'vitest';
import { getMiniGameBrief, getModuleDuration } from './minigamePresentation';

describe('minigame presentation contract', () => {
  it('gives representative games exact objectives and controls', () => {
    for (const type of ['pattern', 'tetris', 'safedial'] as const) {
      const brief = getMiniGameBrief(type);
      expect(brief.objective.length).toBeGreaterThan(20);
      expect(brief.passRequirement.length).toBeGreaterThan(20);
      expect(brief.controls.length).toBeGreaterThan(20);
      expect(getModuleDuration(type)).toBeGreaterThan(0);
    }
  });
});

