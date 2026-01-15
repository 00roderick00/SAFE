// Game State Store - manages bot safes, history, notifications

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BotSafe, AttackResult, DefenseEvent, GameNotification } from '../types';
import { generateBotFeed, generatePracticeSafe } from '../game/matchmaking';
import { ECONOMY } from '../game/constants';

interface GameStore {
  // State
  botSafes: BotSafe[];
  practiceSafe: BotSafe | null;
  attackHistory: AttackResult[];
  defenseHistory: DefenseEvent[];
  notifications: GameNotification[];
  lastBotRefresh: number;
  recentlyAttacked: string[]; // bot IDs attacked recently

  // Actions
  refreshBotSafes: (playerRating: number) => void;
  getPracticeSafe: () => BotSafe;
  addAttackResult: (result: AttackResult) => void;
  addDefenseEvent: (event: DefenseEvent) => void;
  addNotification: (notification: Omit<GameNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  recordBotAttacked: (botId: string) => void;
  updateBotCooldown: (botId: string) => void;
  getUnreadCount: () => number;

  // Simulated defense events (for bot attacks on player)
  simulateDefense: (playerBalance: number, playerSecurityScore: number) => DefenseEvent | null;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      botSafes: [],
      practiceSafe: null,
      attackHistory: [],
      defenseHistory: [],
      notifications: [],
      lastBotRefresh: 0,
      recentlyAttacked: [],

      refreshBotSafes: (playerRating) => {
        const safes = generateBotFeed(playerRating, 15);
        set({
          botSafes: safes,
          lastBotRefresh: Date.now(),
        });
      },

      getPracticeSafe: () => {
        let safe = get().practiceSafe;
        if (!safe) {
          safe = generatePracticeSafe();
          set({ practiceSafe: safe });
        }
        return safe;
      },

      addAttackResult: (result) =>
        set((state) => ({
          attackHistory: [result, ...state.attackHistory].slice(0, 50), // keep last 50
        })),

      addDefenseEvent: (event) =>
        set((state) => ({
          defenseHistory: [event, ...state.defenseHistory].slice(0, 50),
        })),

      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}`,
              timestamp: Date.now(),
              read: false,
            },
            ...state.notifications,
          ].slice(0, 30), // keep last 30
        })),

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      clearNotifications: () => set({ notifications: [] }),

      recordBotAttacked: (botId) =>
        set((state) => ({
          recentlyAttacked: [...new Set([botId, ...state.recentlyAttacked])].slice(0, 20),
        })),

      updateBotCooldown: (botId) =>
        set((state) => ({
          botSafes: state.botSafes.map((bot) =>
            bot.id === botId
              ? {
                  ...bot,
                  lastAttackedAt: Date.now(),
                  attackCooldownUntil: Date.now() + ECONOMY.samTargetCooldown * 1000,
                }
              : bot
          ),
        })),

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },

      simulateDefense: (playerBalance, playerSecurityScore) => {
        // Random chance of simulated attack (5% when checked)
        if (Math.random() > 0.05) return null;

        // Determine if attack succeeds based on player's security
        const attackerSkill = 0.3 + Math.random() * 0.5;
        const defenseStrength = playerSecurityScore / 100;
        const attackSucceeds = attackerSkill > defenseStrength;

        const attackerName = 'ShadowBot' + Math.floor(Math.random() * 1000);
        const feeAmount = Math.round(Math.sqrt(playerBalance) * (0.8 + 1.6 / (1 + playerSecurityScore)));

        if (attackSucceeds) {
          const lootLost = Math.round(playerBalance * ECONOMY.lootFraction);
          return {
            id: `defense-${Date.now()}`,
            timestamp: Date.now(),
            attackerName,
            success: false, // from defender's perspective, this is a failed defense
            moduleResults: [],
            feeEarned: 0,
            lootLost,
            insurancePayout: 0,
          };
        } else {
          return {
            id: `defense-${Date.now()}`,
            timestamp: Date.now(),
            attackerName,
            success: true, // defender succeeded
            moduleResults: [],
            feeEarned: feeAmount,
            lootLost: 0,
            insurancePayout: 0,
          };
        }
      },
    }),
    {
      name: 'safe-game-storage',
      partialize: (state) => ({
        attackHistory: state.attackHistory,
        defenseHistory: state.defenseHistory,
        notifications: state.notifications,
        recentlyAttacked: state.recentlyAttacked,
      }),
    }
  )
);
