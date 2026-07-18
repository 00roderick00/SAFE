// Loadout helpers. Kept out of the screen so the mapping from a
// marketplace game → equippable SecurityModule is unit-testable and
// reused anywhere a custom game gets equipped.

import type { SecurityModule, ModuleType } from '../types';
import type { PublicCustomGame } from '../services/api';
import { sanitizeUserText } from '../utils/sanitize';

/**
 * Build the SecurityModule a marketplace game occupies when equipped
 * into a given slot. The slot index is folded into the module id so
 * re-equipping the same game into the same slot is idempotent (stable
 * id → the server write is a pure overwrite, not an append).
 *
 * Display strings are sanitized here too, so a stored prompt-injection
 * or garbage title can't leak into the loadout an attacker later sees.
 */
export function buildCustomModule(g: PublicCustomGame, slotIndex: number): SecurityModule {
  const payload = g.mode === 'dsl_program' ? g.dsl_program : g.config;
  return {
    id: `${g.id}-slot-${slotIndex}`,
    type: g.base_engine as ModuleType,
    difficulty: g.calibrated_difficulty ?? 0.5,
    weight: 1,
    name: sanitizeUserText(g.name, { maxLength: 60 }),
    description: sanitizeUserText(g.description, { maxLength: 200 }),
    customGameId: g.id,
    customConfig: {
      baseEngine: g.base_engine as ModuleType,
      config: payload ?? {},
      mode: g.mode,
    },
  };
}
