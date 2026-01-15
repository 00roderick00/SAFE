// SAFE Game - Economy Calculations
// All formulas from the design spec

import { SecurityModule, SecurityLoadout, EconomyStats, InsurancePolicy } from '../types';
import { ECONOMY, MODULE_CONFIG, DIFFICULTY_BANDS, LOOT_RANGES, SUCCESS_CHANCES } from './constants';

/**
 * Calculate module strength: s_j = w_j * (exp(k_j * d_j) - 1)
 */
export function calculateModuleStrength(module: SecurityModule): number {
  const config = MODULE_CONFIG[module.type];
  const k = config.hardnessConstant;
  return module.weight * (Math.exp(k * module.difficulty) - 1);
}

/**
 * Calculate total security score: S = Σ s_j
 * Capped at maxSecurityScore
 */
export function calculateSecurityScore(loadout: SecurityLoadout): number {
  const rawScore = loadout.modules.reduce(
    (sum, module) => sum + calculateModuleStrength(module),
    0
  );
  // Normalize to 0-100 range
  const normalizedScore = Math.min(rawScore * 10, ECONOMY.maxSecurityScore);
  return Math.round(normalizedScore * 100) / 100;
}

/**
 * Calculate success probability using logistic function
 * p_success = σ((A - D) / τ)
 * where σ(x) = 1/(1+e^(-x))
 */
export function calculateSuccessProbability(
  attackerRating: number,
  defenderSecurityScore: number
): number {
  const A = attackerRating / 100; // normalize attacker rating
  const D = defenderSecurityScore;
  const tau = ECONOMY.skillCurveSharpness;

  const x = (A - D) / tau;
  const sigmoid = 1 / (1 + Math.exp(-x));

  // Clamp to min/max
  return Math.max(
    ECONOMY.successRateMin,
    Math.min(ECONOMY.successRateMax, sigmoid)
  );
}

/**
 * Calculate attack fee/stake
 * F = sqrt(V) * (a + b/(1+S))
 */
export function calculateAttackFee(
  safeValue: number,
  securityScore: number,
  attackerBalance?: number
): number {
  const { a, b } = ECONOMY.feeParams;
  const ease = 1 / (1 + securityScore);
  const vEff = Math.sqrt(safeValue);

  let fee = vEff * (a + b * ease);

  // Apply caps
  fee = Math.max(ECONOMY.feeMin, Math.min(ECONOMY.feeMax, fee));

  // If attacker balance provided, cap at percentage of balance
  if (attackerBalance !== undefined) {
    const maxByBalance = attackerBalance * ECONOMY.feeMaxPercentOfBalance;
    fee = Math.min(fee, maxByBalance);
  }

  return Math.round(fee);
}

/**
 * Calculate potential loot on successful heist
 * L = min(V * ℓ, L_cap)
 */
export function calculateLoot(safeValue: number): number {
  const rawLoot = safeValue * ECONOMY.lootFraction;
  return Math.min(rawLoot, ECONOMY.lootCap);
}

/**
 * Calculate loot distribution after platform cut
 */
export function calculateLootDistribution(loot: number): {
  attackerReceives: number;
  platformReceives: number;
  defenderLoses: number;
} {
  const platformReceives = Math.round(loot * ECONOMY.platformCut);
  const attackerReceives = loot - platformReceives;
  return {
    attackerReceives,
    platformReceives,
    defenderLoses: loot,
  };
}

/**
 * Calculate defender earnings when attack fails
 */
export function calculateDefenderEarnings(attackFee: number): {
  defenderReceives: number;
  platformReceives: number;
} {
  const platformReceives = Math.round(attackFee * ECONOMY.platformCutFail);
  const defenderReceives = attackFee - platformReceives;
  return {
    defenderReceives,
    platformReceives,
  };
}

/**
 * Calculate insurance premium
 * π = (EL * T) * (1 + margin) + fixed_fee
 * With security discount
 */
export function calculateInsurancePremium(
  safeValue: number,
  securityScore: number,
  duration: number,
  coverage: number,
  estimatedAttackRate: number = 0.1 // attacks per hour
): number {
  const { margin, fixedFee, securityDiscount } = ECONOMY.insurance;

  // Expected loss per hour
  const successProb = calculateSuccessProbability(1000, securityScore); // average attacker
  const loot = calculateLoot(safeValue) * coverage;
  const expectedLossPerHour = estimatedAttackRate * successProb * loot;

  // Duration in hours
  const durationHours = duration / 3600;

  // Base premium
  let premium = expectedLossPerHour * durationHours * (1 + margin) + fixedFee;

  // Security discount (higher security = lower premium)
  const normalizedSecurity = securityScore / ECONOMY.maxSecurityScore;
  premium *= 1 - securityDiscount * normalizedSecurity;

  return Math.round(Math.max(premium, fixedFee));
}

/**
 * Process insurance claim after breach
 */
export function processInsuranceClaim(
  policy: InsurancePolicy,
  lootLost: number
): {
  payout: number;
  claimsRemaining: number;
  policyValid: boolean;
} {
  const now = Date.now();

  // Check if policy is still valid
  if (now > policy.expiresAt || policy.claimsRemaining <= 0) {
    return { payout: 0, claimsRemaining: 0, policyValid: false };
  }

  const payout = Math.min(
    lootLost * policy.coverage,
    policy.maxPayout
  );

  return {
    payout: Math.round(payout),
    claimsRemaining: policy.claimsRemaining - 1,
    policyValid: true,
  };
}

/**
 * Apply principal floor protection
 * Ensures safe balance doesn't drop below minimum
 */
export function applyPrincipalFloor(
  currentBalance: number,
  lootLost: number
): {
  actualLoss: number;
  newBalance: number;
} {
  const potentialNewBalance = currentBalance - lootLost;

  if (potentialNewBalance < ECONOMY.principalFloor) {
    const actualLoss = currentBalance - ECONOMY.principalFloor;
    return {
      actualLoss: Math.max(0, actualLoss),
      newBalance: ECONOMY.principalFloor,
    };
  }

  return {
    actualLoss: lootLost,
    newBalance: potentialNewBalance,
  };
}

/**
 * Get difficulty band label
 */
export function getDifficultyBand(securityScore: number): 'soft' | 'tricky' | 'brutal' {
  if (securityScore <= DIFFICULTY_BANDS.soft.max) return 'soft';
  if (securityScore <= DIFFICULTY_BANDS.tricky.max) return 'tricky';
  return 'brutal';
}

/**
 * Get loot range label
 */
export function getLootRange(safeValue: number): 'small' | 'moderate' | 'rich' {
  if (safeValue <= LOOT_RANGES.small.max) return 'small';
  if (safeValue <= LOOT_RANGES.moderate.max) return 'moderate';
  return 'rich';
}

/**
 * Get success chance label
 */
export function getSuccessChanceLabel(probability: number): 'low' | 'medium' | 'high' {
  if (probability <= SUCCESS_CHANCES.low.max) return 'low';
  if (probability <= SUCCESS_CHANCES.medium.max) return 'medium';
  return 'high';
}

/**
 * Calculate comprehensive economy stats for a safe configuration
 */
export function calculateEconomyStats(
  safeValue: number,
  loadout: SecurityLoadout,
  attackerRating: number = 1000
): EconomyStats {
  const securityScore = calculateSecurityScore(loadout);
  const successProb = calculateSuccessProbability(attackerRating, securityScore);
  const attackFee = calculateAttackFee(safeValue, securityScore);
  const potentialLoot = calculateLoot(safeValue);

  // Estimate attacks per day based on attractiveness
  // Lower security = more attractive = more attacks
  const baseAttacksPerDay = 5;
  const attractiveness = 1 / (1 + securityScore / 50);
  const estimatedAttacksPerDay = Math.round(baseAttacksPerDay * attractiveness * 10) / 10;

  // Expected income from failed attacks
  const failRate = 1 - successProb;
  const { defenderReceives } = calculateDefenderEarnings(attackFee);
  const estimatedFailIncomePerDay = Math.round(
    estimatedAttacksPerDay * failRate * defenderReceives
  );

  // Expected loss from successful attacks
  const estimatedBreachRiskPerDay = Math.round(
    estimatedAttacksPerDay * successProb * potentialLoot
  );

  // Recommend insurance if breach risk exceeds fail income
  const recommendedInsurance = estimatedBreachRiskPerDay > estimatedFailIncomePerDay;

  return {
    securityScore,
    estimatedAttacksPerDay,
    estimatedFailIncomePerDay,
    estimatedBreachRiskPerDay,
    recommendedInsurance,
    attackFee,
    potentialLoot,
  };
}

/**
 * Calculate breach result from mini-game scores
 * Uses weighted score model: breach if X >= θ
 */
export function calculateBreachResult(
  moduleScores: { moduleId: string; score: number; weight: number }[]
): {
  totalScore: number;
  threshold: number;
  breached: boolean;
} {
  const totalWeight = moduleScores.reduce((sum, m) => sum + m.weight, 0);
  const weightedScore = moduleScores.reduce(
    (sum, m) => sum + (m.score * m.weight) / totalWeight,
    0
  );

  return {
    totalScore: Math.round(weightedScore * 100) / 100,
    threshold: ECONOMY.breachThreshold,
    breached: weightedScore >= ECONOMY.breachThreshold,
  };
}
