import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit2, Trophy, Target, Shield, Star, Lock } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useSocialStore, AVAILABLE_ACHIEVEMENTS } from '../store/socialStore';
import { calculateSecurityScore } from '../game/economy';

const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🐨', '🐸', '🦉', '🦅', '🐉', '👹'];

export const ProfileScreen = () => {
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  const {
    username,
    setUsername,
    safeBalance,
    securityLoadout,
    totalEarnings,
    totalLosses,
    successfulHeists,
    successfulDefenses,
    riskRating,
  } = usePlayerStore();

  const { achievements, checkAchievements } = useSocialStore();
  const [avatar, setAvatar] = useState(AVATARS[0]);

  const securityScore = calculateSecurityScore(securityLoadout);
  const winRate = successfulHeists + successfulDefenses > 0
    ? Math.round((successfulHeists / (successfulHeists + successfulDefenses)) * 100)
    : 0;

  // Check achievements on mount
  checkAchievements({
    heists: successfulHeists,
    defenses: successfulDefenses,
    balance: safeBalance,
    score: securityScore,
  });

  const handleSaveName = () => {
    if (tempUsername.trim()) {
      setUsername(tempUsername.trim());
    }
    setIsEditingName(false);
  };

  const stats = [
    { label: 'Total Earnings', value: `+${totalEarnings.toLocaleString()}`, icon: Trophy, color: 'text-primary' },
    { label: 'Total Losses', value: `-${totalLosses.toLocaleString()}`, icon: Target, color: 'text-danger' },
    { label: 'Successful Heists', value: successfulHeists, icon: Target, color: 'text-warning' },
    { label: 'Successful Defenses', value: successfulDefenses, icon: Shield, color: 'text-primary' },
    { label: 'Security Score', value: Math.round(securityScore), icon: Lock, color: 'text-primary' },
    { label: 'Risk Rating', value: riskRating, icon: Star, color: 'text-warning' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/')}
            className="p-2 -ml-2 text-text-dim hover:text-text"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="ml-2 text-lg font-semibold">Profile</h1>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-clean p-6 mb-6"
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <button
              onClick={() => setIsPickingAvatar(true)}
              className="w-20 h-20 bg-surface-light rounded-2xl flex items-center justify-center text-4xl hover:bg-surface-light/80 transition-colors"
            >
              {avatar}
            </button>

            {/* Name & Balance */}
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    placeholder="Enter username"
                    className="flex-1 px-3 py-1 bg-surface-light border border-border rounded-lg text-text focus:outline-none focus:border-primary"
                    maxLength={20}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-3 py-1 bg-primary text-background rounded-lg text-sm"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{username || 'Anonymous'}</h2>
                  <button
                    onClick={() => {
                      setTempUsername(username);
                      setIsEditingName(true);
                    }}
                    className="p-1 text-text-dim hover:text-text"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
              <p className="text-2xl font-display font-bold text-primary mt-1">
                {safeBalance.toLocaleString()} tokens
              </p>
            </div>
          </div>
        </motion.div>

        {/* Avatar picker modal */}
        {isPickingAvatar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => setIsPickingAvatar(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="card-clean p-6 w-full max-w-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4 text-center">Choose Avatar</h3>
              <div className="grid grid-cols-4 gap-3">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAvatar(a);
                      setIsPickingAvatar(false);
                    }}
                    className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl transition-all ${
                      avatar === a
                        ? 'bg-primary/20 border-2 border-primary'
                        : 'bg-surface-light hover:bg-surface-light/80'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          {stats.map((stat, idx) => (
            <div key={idx} className="card-clean p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={14} className={stat.color} />
                <span className="text-xs text-text-dim">{stat.label}</span>
              </div>
              <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </motion.div>

        {/* Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
            Achievements ({achievements.length}/{AVAILABLE_ACHIEVEMENTS.length})
          </h3>

          <div className="grid grid-cols-4 gap-3">
            {AVAILABLE_ACHIEVEMENTS.map((achievement) => {
              const unlocked = achievements.some((a) => a.id === achievement.id);
              return (
                <div
                  key={achievement.id}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center p-2 text-center ${
                    unlocked
                      ? 'bg-primary/20 border border-primary/30'
                      : 'bg-surface-light opacity-50'
                  }`}
                  title={achievement.description}
                >
                  <span className="text-2xl mb-1">{unlocked ? achievement.icon : '🔒'}</span>
                  <span className="text-[10px] text-text-dim leading-tight">{achievement.name}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Leaderboard link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <button
            onClick={() => navigate('/leaderboard')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-surface-light border border-border rounded-xl hover:border-primary/30 transition-colors"
          >
            <Trophy size={18} className="text-warning" />
            <span className="text-sm">View Leaderboard</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};
