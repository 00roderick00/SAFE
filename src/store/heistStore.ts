// Heist State Store - manages active heist/attack state
//
// After Phase 2 the source of truth for an attack is the server.
// A "server attack" is started via startServerAttack(), the module
// list comes from the AttackStartPayload, and completeServerAttack()
// posts the collected results to the submit_result Edge Function
// which decides win/loss.
//
// The legacy client-only path (startAttack/completeAttack) is kept
// so that unit tests and dev-mode-without-Supabase still function.
// Real user gameplay always uses the server path.

import { create } from 'zustand';
import { BotSafe, MiniGameResult, AttackResult } from '../types';
import { ECONOMY } from '../game/constants';
import { api, type AttackModuleSeed, type AttackStartPayload, type SubmitResultPayload } from '../services/api';

interface ServerAttack {
  attackId: string;
  defenderHandle: string;
  isBotTarget: boolean;
  stake: number;
  potentialLoot: number;
  modules: AttackModuleSeed[];
}

interface HeistStore {
  // Legacy state (client-computed attacks)
  currentTarget: BotSafe | null;
  currentModuleIndex: number;
  moduleResults: MiniGameResult[];
  attackStartedAt: number | null;
  stakePaid: number;

  // Server-driven attack state
  serverAttack: ServerAttack | null;

  // Legacy actions
  startAttack: (target: BotSafe, stake: number) => void;
  recordModuleResult: (result: MiniGameResult) => void;
  nextModule: () => boolean;
  completeAttack: () => AttackResult | null;
  cancelAttack: () => void;
  resetHeist: () => void;

  // Server actions
  startServerAttack: (input: { defenderSafeId?: string; botDifficulty?: number }) => Promise<AttackStartPayload>;
  completeServerAttack: () => Promise<SubmitResultPayload | null>;

  // Getters
  getCurrentModule: () => {
    id: string;
    type: string;
    difficulty: number;
    weight: number;
    name: string;
    description: string;
    seed?: string;
    customConfig?: { baseEngine: string; config: unknown; mode?: 'engine_config' | 'dsl_program' };
  } | null;
  getProgress: () => { current: number; total: number };
}

export const useHeistStore = create<HeistStore>((set, get) => ({
  currentTarget: null,
  currentModuleIndex: 0,
  moduleResults: [],
  attackStartedAt: null,
  stakePaid: 0,
  serverAttack: null,

  startAttack: (target, stake) =>
    set({
      currentTarget: target,
      currentModuleIndex: 0,
      moduleResults: [],
      attackStartedAt: Date.now(),
      stakePaid: stake,
      serverAttack: null,
    }),

  startServerAttack: async (input) => {
    const payload = await api.startAttack(input);
    set({
      serverAttack: payload,
      currentTarget: null,
      currentModuleIndex: 0,
      moduleResults: [],
      attackStartedAt: Date.now(),
      stakePaid: payload.stake,
    });
    return payload;
  },

  recordModuleResult: (result) =>
    set((state) => ({
      moduleResults: [...state.moduleResults, result],
    })),

  nextModule: () => {
    const state = get();
    const totalModules = state.serverAttack
      ? state.serverAttack.modules.length
      : state.currentTarget?.securityLoadout.modules.length ?? 0;

    const nextIndex = state.currentModuleIndex + 1;
    const hasMore = nextIndex < totalModules;
    if (hasMore) set({ currentModuleIndex: nextIndex });
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

    const totalWeight = modules.reduce((sum, m) => sum + m.weight, 0);
    const totalScore = state.moduleResults.reduce((sum, result, index) => {
      return sum + (result.score * modules[index].weight) / totalWeight;
    }, 0);

    const allModulesPassed = state.moduleResults.length === modules.length &&
      state.moduleResults.every(r => r.passed);
    const success = allModulesPassed;

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
      threshold: 1,
      stakePaid: state.stakePaid,
      lootGained,
      platformFee,
    };
    return result;
  },

  completeServerAttack: async () => {
    const state = get();
    if (!state.serverAttack) return null;
    const results = state.moduleResults.map((r, i) => ({
      moduleIndex: i,
      moduleType: state.serverAttack!.modules[i].moduleType,
      score: r.score,
      passed: r.passed,
      timeSpent: r.timeSpent,
      // DSL modules ship their recorded input trace so the server can
      // replay + verify the win (client passed/score is not trusted).
      ...(r.inputTrace ? { inputTrace: r.inputTrace } : {}),
    }));
    return api.submitResult({ attackId: state.serverAttack.attackId, results });
  },

  cancelAttack: () => set({
    currentTarget: null,
    currentModuleIndex: 0,
    moduleResults: [],
    attackStartedAt: null,
    stakePaid: 0,
    serverAttack: null,
  }),

  resetHeist: () => set({
    currentTarget: null,
    currentModuleIndex: 0,
    moduleResults: [],
    attackStartedAt: null,
    stakePaid: 0,
    serverAttack: null,
  }),

  getCurrentModule: () => {
    const state = get();
    if (state.serverAttack) {
      const m = state.serverAttack.modules[state.currentModuleIndex];
      if (!m) return null;
      // Custom modules ship { baseEngine, config } in the seed row;
      // the attack screen renders `baseEngine` as the engine type and
      // hands `config` to the minigame host.
      const isCustom = Boolean(m.baseEngine);
      return {
        id: `${state.serverAttack.attackId}-${m.index}`,
        type: (isCustom ? m.baseEngine! : m.moduleType),
        difficulty: m.difficulty,
        weight: 1,
        name: m.moduleType,
        description: '',
        seed: m.seed,
        customConfig: isCustom
          ? { baseEngine: m.baseEngine!, config: m.config, mode: m.mode }
          : undefined,
      };
    }
    if (!state.currentTarget) return null;
    return state.currentTarget.securityLoadout.modules[state.currentModuleIndex] || null;
  },

  getProgress: () => {
    const state = get();
    const total = state.serverAttack
      ? state.serverAttack.modules.length
      : state.currentTarget?.securityLoadout.modules.length ?? 0;
    return { current: state.currentModuleIndex + 1, total };
  },
}));
