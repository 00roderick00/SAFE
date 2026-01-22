// Social/Multiplayer Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  rank: number;
  safeBalance: number;
  totalHeists: number;
  successRate: number;
  isPlayer?: boolean;
}

interface PlayerProfile {
  id: string;
  username: string;
  avatar: string;
  joinedAt: number;
  safeBalance: number;
  securityScore: number;
  totalHeists: number;
  successfulHeists: number;
  totalDefenses: number;
  successfulDefenses: number;
  riskRating: number;
  achievements: Achievement[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

interface SocialStore {
  leaderboard: LeaderboardEntry[];
  playerProfile: PlayerProfile | null;
  achievements: Achievement[];

  // Actions
  refreshLeaderboard: () => void;
  updatePlayerProfile: (profile: Partial<PlayerProfile>) => void;
  unlockAchievement: (id: string) => void;
  checkAchievements: (stats: { heists: number; defenses: number; balance: number; score: number }) => void;
}

// Generate fake leaderboard data
const generateLeaderboard = (): LeaderboardEntry[] => {
  const names = [
    'CryptoKing', 'SafeCracker99', 'VaultHunter', 'NeonRaider', 'BitBandit',
    'ShadowThief', 'DigitalGhost', 'CyberWolf', 'PixelPirate', 'DataDemon',
    'ByteBurglar', 'HexHacker', 'MatrixMaster', 'QuantumThief', 'NightOwl42',
    'SteelViper', 'IronFang', 'GhostByte', 'TechNinja', 'CodeBreaker',
  ];

  return names.map((name, index) => ({
    id: `player-${index}`,
    username: name,
    score: Math.floor(50000 - index * 2000 - Math.random() * 1000),
    rank: index + 1,
    safeBalance: Math.floor(10000 - index * 400 - Math.random() * 500),
    totalHeists: Math.floor(100 - index * 4 - Math.random() * 10),
    successRate: Math.max(0.3, 0.85 - index * 0.02 - Math.random() * 0.1),
  }));
};

// Available achievements
const AVAILABLE_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-heist',
    name: 'First Heist',
    description: 'Complete your first heist attempt',
    icon: '🎯',
    unlockedAt: 0,
  },
  {
    id: 'safe-cracker',
    name: 'Safe Cracker',
    description: 'Successfully breach 10 safes',
    icon: '🔓',
    unlockedAt: 0,
  },
  {
    id: 'master-thief',
    name: 'Master Thief',
    description: 'Successfully breach 50 safes',
    icon: '👑',
    unlockedAt: 0,
  },
  {
    id: 'iron-wall',
    name: 'Iron Wall',
    description: 'Defend against 10 attacks',
    icon: '🛡️',
    unlockedAt: 0,
  },
  {
    id: 'fortress',
    name: 'Fortress',
    description: 'Defend against 50 attacks',
    icon: '🏰',
    unlockedAt: 0,
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Reach a balance of 10,000 tokens',
    icon: '💰',
    unlockedAt: 0,
  },
  {
    id: 'security-expert',
    name: 'Security Expert',
    description: 'Achieve a security score of 80+',
    icon: '🔐',
    unlockedAt: 0,
  },
  {
    id: 'perfect-heist',
    name: 'Perfect Heist',
    description: 'Complete a heist with 100% score',
    icon: '⭐',
    unlockedAt: 0,
  },
];

export const useSocialStore = create<SocialStore>()(
  persist(
    (set, get) => ({
      leaderboard: generateLeaderboard(),
      playerProfile: null,
      achievements: [],

      refreshLeaderboard: () => {
        // Regenerate leaderboard with some variation
        const newLeaderboard = generateLeaderboard();
        set({ leaderboard: newLeaderboard });
      },

      updatePlayerProfile: (profile) =>
        set((state) => ({
          playerProfile: state.playerProfile
            ? { ...state.playerProfile, ...profile }
            : null,
        })),

      unlockAchievement: (id) =>
        set((state) => {
          const achievement = AVAILABLE_ACHIEVEMENTS.find((a) => a.id === id);
          if (!achievement || state.achievements.some((a) => a.id === id)) {
            return state;
          }
          return {
            achievements: [
              ...state.achievements,
              { ...achievement, unlockedAt: Date.now() },
            ],
          };
        }),

      checkAchievements: ({ heists, defenses, balance, score }) => {
        const { unlockAchievement, achievements } = get();

        // Check each achievement condition
        if (heists >= 1 && !achievements.some((a) => a.id === 'first-heist')) {
          unlockAchievement('first-heist');
        }
        if (heists >= 10 && !achievements.some((a) => a.id === 'safe-cracker')) {
          unlockAchievement('safe-cracker');
        }
        if (heists >= 50 && !achievements.some((a) => a.id === 'master-thief')) {
          unlockAchievement('master-thief');
        }
        if (defenses >= 10 && !achievements.some((a) => a.id === 'iron-wall')) {
          unlockAchievement('iron-wall');
        }
        if (defenses >= 50 && !achievements.some((a) => a.id === 'fortress')) {
          unlockAchievement('fortress');
        }
        if (balance >= 10000 && !achievements.some((a) => a.id === 'millionaire')) {
          unlockAchievement('millionaire');
        }
        if (score >= 80 && !achievements.some((a) => a.id === 'security-expert')) {
          unlockAchievement('security-expert');
        }
      },
    }),
    {
      name: 'safe-social-storage',
    }
  )
);

export { AVAILABLE_ACHIEVEMENTS };
