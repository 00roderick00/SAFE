import type { AttackResult, DefenseEvent } from '../types';
import type { ModuleType, SecurityModule } from '../types';
import type { DataPoint } from '../components/earningsData';
import { MODULE_CONFIG } from './constants';
import { calculateLoot, calculateLootDistribution } from './economy';

export function activityDelta(event: AttackResult | DefenseEvent): number {
  if ('targetName' in event) return event.success ? event.lootGained : -event.stakePaid;
  return event.success ? event.feeEarned : -(event.lootLost - event.insurancePayout);
}

/** Reconstruct stored balance history from settled events; never invents performance. */
export function buildBalanceHistory(
  currentBalance: number,
  attacks: AttackResult[],
  defenses: DefenseEvent[],
): DataPoint[] {
  const events = [...attacks, ...defenses].sort((a, b) => b.timestamp - a.timestamp);
  if (events.length === 0) return [];

  let balance = currentBalance;
  const points: DataPoint[] = [{ timestamp: Date.now(), value: currentBalance }];
  for (const event of events) {
    balance -= activityDelta(event);
    points.push({ timestamp: event.timestamp - 1, value: Math.max(0, balance) });
  }
  return points.reverse();
}

export interface PayoutPresentation {
  grossLoot: number;
  platformCut: number;
  netPayout: number;
}

/** Uses the shared economy formulas and names each amount by settlement role. */
export function getPayoutPresentation(safeBalance: number): PayoutPresentation {
  const grossLoot = calculateLoot(safeBalance);
  const split = calculateLootDistribution(grossLoot);
  return {
    grossLoot,
    platformCut: split.platformReceives,
    netPayout: split.attackerReceives,
  };
}

export function getExpectedDuration(modules: SecurityModule[]): number {
  return modules.reduce((total, module) => {
    const config = MODULE_CONFIG[module.type as keyof typeof MODULE_CONFIG] as { duration?: number; defaults?: { timeLimit?: number } };
    return total + (config.duration ?? config.defaults?.timeLimit ?? 15);
  }, 0);
}

export function getFamiliarity(modules: SecurityModule[], familiarTypes: Set<ModuleType>) {
  const familiar = modules.filter((module) => familiarTypes.has(module.type)).length;
  return { familiar, unfamiliar: modules.length - familiar };
}

export function getTargetAvailability(
  stake: number,
  playerBalance: number,
  cooldownUntil: number | null,
  now: number,
) {
  const affordable = stake <= playerBalance;
  const cooldown = Boolean(cooldownUntil && cooldownUntil > now);
  return {
    affordable,
    cooldown,
    selectable: affordable && !cooldown,
    label: !affordable ? 'Cannot afford' : cooldown ? 'Cooldown' : 'Ready',
  };
}
