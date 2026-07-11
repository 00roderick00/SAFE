// Game State Store - manages bot safes, history, notifications

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BotSafe, AttackResult, DefenseEvent, GameNotification, InsurancePolicy, SecurityLoadout } from '../types';
import { generateBotFeed, generatePracticeSafe } from '../game/matchmaking';
import { ECONOMY } from '../game/constants';
import { calculateAttackFee, processInsuranceClaim } from '../game/economy';
import { api } from '../services/api';

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
  /**
   * Server-backed target refresh: pull real players' safe snapshots
   * from Supabase and backfill with bots up to `count`. When there is
   * no session or the query fails, falls back to `refreshBotSafes`.
   */
  refreshTargetsFromServer: (userId: string, playerRating: number, count?: number) => Promise<void>;
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
  simulateDefense: (
    playerBalance: number,
    playerLoadout: SecurityLoadout,
    insurancePolicy: InsurancePolicy | null
  ) => DefenseEvent | null;
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

      refreshTargetsFromServer: async (_userId, playerRating, count = 15) => {
        try {
          // Server owns the whole target list — real safes + seeded
          // bots — so the id on each card round-trips 1:1 into
          // start_attack. See supabase/functions/list_targets/.
          const targets = await api.fetchTargetList(count);
          const botSafes: BotSafe[] = targets.map((t) => ({
            id: t.id,
            ownerName: t.handle,
            safeBalance: t.balance,
            securityScore: t.securityScore,
            securityLoadout: t.securityLoadout,
            difficultyBand: t.difficultyBand,
            lootRange: t.lootRange,
            attackFee: t.attackFee,
            lastAttackedAt: t.lastAttackedAt ? new Date(t.lastAttackedAt).getTime() : null,
            attackCooldownUntil: null,
            tagline: t.tagline ?? (t.isBot ? undefined : 'Live target'),
          }));
          set({ botSafes, lastBotRefresh: Date.now() });
        } catch (err) {
          // Fall back to local bots when the server is unreachable.
          // eslint-disable-next-line no-console
          console.warn('[targets] server refresh failed, using local bots', err);
          const safes = generateBotFeed(playerRating, count);
          set({ botSafes: safes, lastBotRefresh: Date.now() });
        }
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

      simulateDefense: (playerBalance, playerLoadout, insurancePolicy) => {
        // Random chance of an incoming attack this tick.
        if (Math.random() > 0.05) return null;

        // Resolve deterministically against the actual loadout: for each
        // module, an attacker of ability `attackerSkill` beats the lock
        // iff attackerSkill > lock.difficulty. Attack succeeds only if
        // ALL locks are beaten (matches the player-side all-or-nothing
        // model in heistStore.completeAttack).
        const attackerSkill = 0.3 + Math.random() * 0.5;
        const moduleResults = playerLoadout.modules.map((module) => {
          const defended = attackerSkill <= module.difficulty;
          return {
            moduleId: module.id,
            attackerScore: Number(Math.min(1, attackerSkill / Math.max(0.01, module.difficulty)).toFixed(3)),
            defended,
          };
        });

        const attackerBreached = moduleResults.length > 0 && moduleResults.every((r) => !r.defended);
        const playerSecurityScore = playerLoadout.effectiveScore;
        const attackerName = 'ShadowBot' + Math.floor(Math.random() * 1000);
        const feeAmount = calculateAttackFee(playerBalance, playerSecurityScore);

        if (attackerBreached) {
          const lootLost = Math.min(
            Math.round(playerBalance * ECONOMY.lootFraction),
            ECONOMY.lootCap
          );

          let insurancePayout = 0;
          if (insurancePolicy) {
            const claim = processInsuranceClaim(insurancePolicy, lootLost);
            if (claim.policyValid) {
              insurancePayout = claim.payout;
            }
          }

          return {
            id: `defense-${Date.now()}`,
            timestamp: Date.now(),
            attackerName,
            success: false, // defender failed
            moduleResults,
            feeEarned: 0,
            lootLost,
            insurancePayout,
          };
        }

        return {
          id: `defense-${Date.now()}`,
          timestamp: Date.now(),
          attackerName,
          success: true, // defender held
          moduleResults,
          feeEarned: feeAmount,
          lootLost: 0,
          insurancePayout: 0,
        };
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
