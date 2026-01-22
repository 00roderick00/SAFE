// Heist State Store - manages active heist/attack state

import { create } from 'zustand';
import { BotSafe, MiniGameResult, AttackResult } from '../types';
import { generateMiniGameConfig } from '../game/modules';
import { ECONOMY } from '../game/constants';

interface HeistStore {
  // State
  currentTarget: BotSafe | null;
  currentModuleIndex: number;
  moduleResults: MiniGameResult[];
  attackStartedAt: number | null;
  stakePaid: number;

  // Actions
  startAttack: (target: BotSafe, stake: number) => void;
  recordModuleResult: (result: MiniGameResult) => void;
  nextModule: () => boolean; // returns true if more modules
  completeAttack: () => AttackResult | null;
  cancelAttack: () => void;
  resetHeist: () => void;

  // Getters (computed in components)
  getCurrentModule: () => BotSafe['securityLoadout']['modules'][0] | null;
  getProgress: () => { current: number; total: number };
}

export const useHeistStore = create<HeistStore>((set, get) => ({
  currentTarget: null,
  currentModuleIndex: 0,
  moduleResults: [],
  attackStartedAt: null,
  stakePaid: 0,

  startAttack: (target, stake) =>
    set({
      currentTarget: target,
      currentModuleIndex: 0,
      moduleResults: [],
      attackStartedAt: Date.now(),
      stakePaid: stake,
    }),

  recordModuleResult: (result) =>
    set((state) => ({
      moduleResults: [...state.moduleResults, result],
    })),

  nextModule: () => {
    const state = get();
    if (!state.currentTarget) return false;

    const nextIndex = state.currentModuleIndex + 1;
    const hasMore = nextIndex < state.currentTarget.securityLoadout.modules.length;

    if (hasMore) {
      set({ currentModuleIndex: nextIndex });
    }

    return hasMore;
  },

  completeAttack: () => {
    const state = get();
    if (!state.currentTarget || !state.attackStartedAt) return null;

    const modules = state.currentTarget.securityLoadout.modules;
    const moduleScores = state.moduleResults.map((result, index) => ({
      moduleId: modules[index].id,
      score: result.score,
      passed: result.passed,
    }));

    // Calculate total weighted score
    const totalWeight = modules.reduce((sum, m) => sum + m.weight, 0);
    const totalScore = state.moduleResults.reduce((sum, result, index) => {
      return sum + (result.score * modules[index].weight) / totalWeight;
    }, 0);

    // Success requires passing ALL modules
    const allModulesPassed = state.moduleResults.length === modules.length &&
      state.moduleResults.every(r => r.passed);
    const success = allModulesPassed;

    // Calculate loot using economy constants (will be processed by game store)
    const potentialLoot = Math.min(
      state.currentTarget.safeBalance * ECONOMY.lootFraction,
      ECONOMY.lootCap
    );
    const lootGained = success ? Math.round(potentialLoot * (1 - ECONOMY.platformCut)) : 0;
    const platformFee = success ? Math.round(potentialLoot * ECONOMY.platformCut) : 0;

    const result: AttackResult = {
      id: `attack-${Date.now()}`,
      timestamp: Date.now(),
      targetId: state.currentTarget.id,
      targetName: state.currentTarget.ownerName,
      success,
      moduleScores,
      totalScore,
      threshold: 1, // Must pass all locks
      stakePaid: state.stakePaid,
      lootGained,
      platformFee,
    };

    return result;
  },

  cancelAttack: () =>
    set({
      currentTarget: null,
      currentModuleIndex: 0,
      moduleResults: [],
      attackStartedAt: null,
      stakePaid: 0,
    }),

  resetHeist: () =>
    set({
      currentTarget: null,
      currentModuleIndex: 0,
      moduleResults: [],
      attackStartedAt: null,
      stakePaid: 0,
    }),

  getCurrentModule: () => {
    const state = get();
    if (!state.currentTarget) return null;
    return state.currentTarget.securityLoadout.modules[state.currentModuleIndex] || null;
  },

  getProgress: () => {
    const state = get();
    if (!state.currentTarget) return { current: 0, total: 0 };
    return {
      current: state.currentModuleIndex + 1,
      total: state.currentTarget.securityLoadout.modules.length,
    };
  },
}));
