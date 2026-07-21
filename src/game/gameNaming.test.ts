import { describe, it, expect } from 'vitest';
import { MODULE_CONFIG } from './constants';
import { DEBRANDED_GAMES, BANNED_PUBLIC_TERMS, publicGameName } from './gameNaming';

describe('game de-branding (Section 5)', () => {
  it('preserves every internal module id (backward compatibility)', () => {
    for (const g of DEBRANDED_GAMES) {
      expect(MODULE_CONFIG, `internal id "${g.id}" must still exist`).toHaveProperty(g.id);
    }
  });

  it('exposes the SAFE-owned public name for each de-branded game', () => {
    for (const g of DEBRANDED_GAMES) {
      const cfg = MODULE_CONFIG[g.id as keyof typeof MODULE_CONFIG] as { name: string };
      expect(cfg.name, `${g.id} public name`).toBe(g.publicName);
      expect(publicGameName(g.id)).toBe(g.publicName);
    }
  });

  it('never surfaces a recognizable third-party name in ANY player-facing name/description', () => {
    for (const [id, cfg] of Object.entries(MODULE_CONFIG) as [string, { name: string; description: string }][]) {
      const haystack = `${cfg.name} ${cfg.description}`.toLowerCase();
      for (const term of BANNED_PUBLIC_TERMS) {
        expect(haystack.includes(term), `"${term}" leaked in module "${id}" (${cfg.name})`).toBe(false);
      }
    }
  });

  it('uses original names — none equal their legacy name', () => {
    for (const g of DEBRANDED_GAMES) {
      expect(g.publicName.toLowerCase()).not.toBe(g.legacy.toLowerCase());
    }
  });
});
