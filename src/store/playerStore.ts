// Player State Store with localStorage persistence

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PlayerState, SecurityModule, InsurancePolicy, ModuleType } from '../types';
import { ECONOMY, MODULE_CONFIG } from '../game/constants';
import { calculateSecurityScore } from '../game/economy';

interface PlayerStore extends PlayerState {
  // Actions
  setUsername: (username: string) => void;
  depositTokens: (amount: number) => void;
  withdrawTokens: (amount: number) => boolean;
  addEarnings: (amount: number) => void;
  recordLoss: (amount: number) => void;
  updateSecurityModule: (index: number, module: SecurityModule) => void;
  addSecurityModule: (module: SecurityModule) => void;
  removeSecurityModule: (index: number) => void;
  setModuleDifficulty: (index: number, difficulty: number) => void;
  purchaseInsurance: (policy: InsurancePolicy) => void;
  useInsuranceClaim: () => void;
  clearInsurance: () => void;
  enterHeistMode: () => void;
  exitHeistMode: () => void;
  recordSuccessfulDefense: () => void;
  recordSuccessfulHeist: () => void;
  completeOnboarding: () => void;
  updateRiskRating: (delta: number) => void;
  resetPlayer: () => void;
}

const createDefaultModule = (type: ModuleType, index: number): SecurityModule => {
  const config = MODULE_CONFIG[type];
  return {
    id: `module-${index}-${Date.now()}`,
    type,
    difficulty: 0.3,
    weight: config.baseWeight,
    name: config.name,
    description: config.description,
  };
};

const createDefaultLoadout = () => {
  const modules = [
    createDefaultModule('pattern', 0),
    createDefaultModule('keypad', 1),
    createDefaultModule('timing', 2),
  ];

  return {
    modules,
    effectiveScore: calculateSecurityScore({ modules, effectiveScore: 0 }),
  };
};

const initialState: PlayerState = {
  id: `player-${Date.now()}`,
  username: '',
  safeBalance: ECONOMY.startingBalance,
  securityLoadout: createDefaultLoadout(),
  insurancePolicy: null,
  riskRating: ECONOMY.startingRiskRating,
  heistModeActive: false,
  heistModeExpiresAt: null,
  totalEarnings: 0,
  totalLosses: 0,
  successfulDefenses: 0,
  successfulHeists: 0,
  lastActiveAt: Date.now(),
  onboardingCompleted: false,
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUsername: (username) => set({ username }),

      depositTokens: (amount) =>
        set((state) => ({
          safeBalance: state.safeBalance + amount,
        })),

      withdrawTokens: (amount) => {
        const state = get();
        if (state.safeBalance < amount) return false;
        set({ safeBalance: state.safeBalance - amount });
        return true;
      },

      addEarnings: (amount) =>
        set((state) => ({
          safeBalance: state.safeBalance + amount,
          totalEarnings: state.totalEarnings + amount,
        })),

      recordLoss: (amount) =>
        set((state) => ({
          safeBalance: Math.max(ECONOMY.principalFloor, state.safeBalance - amount),
          totalLosses: state.totalLosses + amount,
        })),

      updateSecurityModule: (index, module) =>
        set((state) => {
          const newModules = [...state.securityLoadout.modules];
          newModules[index] = module;
          const newLoadout = {
            modules: newModules,
            effectiveScore: calculateSecurityScore({ modules: newModules, effectiveScore: 0 }),
          };
          return { securityLoadout: newLoadout };
        }),

      addSecurityModule: (module) =>
        set((state) => {
          if (state.securityLoadout.modules.length >= ECONOMY.maxModules) return state;
          const newModules = [...state.securityLoadout.modules, module];
          const newLoadout = {
            modules: newModules,
            effectiveScore: calculateSecurityScore({ modules: newModules, effectiveScore: 0 }),
          };
          return { securityLoadout: newLoadout };
        }),

      removeSecurityModule: (index) =>
        set((state) => {
          const newModules = state.securityLoadout.modules.filter((_, i) => i !== index);
          const newLoadout = {
            modules: newModules,
            effectiveScore: calculateSecurityScore({ modules: newModules, effectiveScore: 0 }),
          };
          return { securityLoadout: newLoadout };
        }),

      setModuleDifficulty: (index, difficulty) =>
        set((state) => {
          const newModules = [...state.securityLoadout.modules];
          newModules[index] = { ...newModules[index], difficulty };
          const newLoadout = {
            modules: newModules,
            effectiveScore: calculateSecurityScore({ modules: newModules, effectiveScore: 0 }),
          };
          return { securityLoadout: newLoadout };
        }),

      purchaseInsurance: (policy) =>
        set((state) => ({
          safeBalance: state.safeBalance - policy.premium,
          insurancePolicy: policy,
        })),

      useInsuranceClaim: () =>
        set((state) => {
          if (!state.insurancePolicy) return state;
          const newClaims = state.insurancePolicy.claimsRemaining - 1;
          if (newClaims <= 0) {
            return { insurancePolicy: null };
          }
          return {
            insurancePolicy: {
              ...state.insurancePolicy,
              claimsRemaining: newClaims,
            },
          };
        }),

      clearInsurance: () => set({ insurancePolicy: null }),

      enterHeistMode: () =>
        set({
          heistModeActive: true,
          heistModeExpiresAt: Date.now() + ECONOMY.heistDuration * 1000,
          lastActiveAt: Date.now(),
        }),

      exitHeistMode: () =>
        set({
          heistModeActive: false,
          heistModeExpiresAt: null,
        }),

      recordSuccessfulDefense: () =>
        set((state) => ({
          successfulDefenses: state.successfulDefenses + 1,
        })),

      recordSuccessfulHeist: () =>
        set((state) => ({
          successfulHeists: state.successfulHeists + 1,
        })),

      completeOnboarding: () => set({ onboardingCompleted: true }),

      updateRiskRating: (delta) =>
        set((state) => ({
          riskRating: Math.max(100, Math.min(2000, state.riskRating + delta)),
        })),

      resetPlayer: () => set({ ...initialState, id: `player-${Date.now()}` }),
    }),
    {
      name: 'safe-player-storage',
    }
  )
);
