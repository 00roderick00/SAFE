// Security Screen - Premium Vault Style
// Features: Serif typography, vault icon, lock slots, clean stats

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, Lock, Shield, ChevronRight } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { calculateEconomyStats } from '../game/economy';
import { MODULE_CONFIG } from '../game/constants';
import { haptics } from '../utils/haptics';

// Vault Icon - 3D metallic style
const VaultIcon = () => (
  <div className="vault-icon">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* Safe body */}
      <rect x="4" y="8" width="40" height="32" rx="4" fill="#2a2a2a" stroke="#3a3a3a" strokeWidth="2" />
      {/* Inner panel */}
      <rect x="8" y="12" width="32" height="24" rx="2" fill="#1a1a1a" />
      {/* Dial */}
      <circle cx="24" cy="24" r="10" fill="#2a2a2a" stroke="#D7FF5D" strokeWidth="2" />
      <circle cx="24" cy="24" r="6" fill="#1a1a1a" />
      <circle cx="24" cy="24" r="2" fill="#D7FF5D" />
      {/* Dial marks */}
      <line x1="24" y1="16" x2="24" y2="18" stroke="#D7FF5D" strokeWidth="1.5" />
      <line x1="24" y1="30" x2="24" y2="32" stroke="#D7FF5D" strokeWidth="1.5" />
      <line x1="16" y1="24" x2="18" y2="24" stroke="#D7FF5D" strokeWidth="1.5" />
      <line x1="30" y1="24" x2="32" y2="24" stroke="#D7FF5D" strokeWidth="1.5" />
      {/* Handle */}
      <rect x="36" y="20" width="4" height="8" rx="1" fill="#3a3a3a" />
    </svg>
  </div>
);

export const SecurityScreen = () => {
  const navigate = useNavigate();
  const { securityLoadout, safeBalance, insurancePolicy } = usePlayerStore();
  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const isInsured = insurancePolicy && Date.now() < insurancePolicy.expiresAt;

  const handleSlotClick = (index: number) => {
    haptics.medium();
    navigate(`/security/pick/${index}`);
  };

  const getModuleConfig = (type: string) => {
    return MODULE_CONFIG[type as keyof typeof MODULE_CONFIG] || MODULE_CONFIG.custom;
  };

  const getDifficultyLabel = (difficulty: number) => {
    if (difficulty < 0.33) return 'Easy';
    if (difficulty < 0.66) return 'Medium';
    return 'Hard';
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-4">
        <div className="flex items-center">
          <button
            onClick={() => {
              haptics.light();
              navigate('/');
            }}
            className="p-2 -ml-2 text-text-dim hover:text-text"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="ml-2 text-lg font-semibold">Your Vault</h1>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Vault Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="vault-container mb-6"
        >
          <VaultIcon />

          {/* Security Score with Serif font */}
          <div className="text-center">
            <p className="section-label mb-2">Security Score</p>
            <p className="vault-score">{Math.round(stats.securityScore)}</p>
          </div>

          {/* Progress bar */}
          <div className="mt-4 mb-2">
            <div className="progress-bar">
              <div
                className="progress-bar-fill neon"
                style={{ width: `${stats.securityScore}%` }}
              />
            </div>
          </div>

          <p className="text-center text-text-dim text-xs">
            {stats.securityScore > 60
              ? 'Strong protection against attacks'
              : stats.securityScore > 30
              ? 'Moderate protection'
              : 'Vulnerable - upgrade your locks'}
          </p>
        </motion.div>

        {/* Lock Slots */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <p className="heading-serif text-lg mb-4 text-center">Your Locks</p>

          <div className="lock-slots">
            {securityLoadout.modules.map((module, index) => {
              const config = getModuleConfig(module.type);
              return (
                <motion.button
                  key={module.id}
                  className="lock-slot"
                  onClick={() => handleSlotClick(index)}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="lock-slot-icon">{config.icon}</div>
                  <div className="lock-slot-name">{config.name}</div>
                  <div className="lock-slot-difficulty">
                    {getDifficultyLabel(module.difficulty)}
                  </div>
                </motion.button>
              );
            })}
          </div>

          <p className="text-center text-text-dim text-xs mt-4">
            Tap a lock to change or test it
          </p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-bordered overflow-hidden mb-6"
        >
          <div className="stat-row px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-profit/10 flex items-center justify-center">
                <TrendingUp size={16} className="text-profit" />
              </div>
              <span className="stat-label">Est. Daily Income</span>
            </div>
            <span className="stat-value text-profit">
              +${stats.estimatedFailIncomePerDay}
            </span>
          </div>

          <div className="stat-row px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-loss/10 flex items-center justify-center">
                <TrendingDown size={16} className="text-loss" />
              </div>
              <span className="stat-label">Est. Daily Risk</span>
            </div>
            <span className="stat-value text-loss">
              -${stats.estimatedBreachRiskPerDay}
            </span>
          </div>

          <div className="stat-row px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
                <Shield size={16} className="text-text-dim" />
              </div>
              <span className="stat-label">Insurance</span>
            </div>
            <span className={`stat-value ${isInsured ? 'text-profit' : 'text-text-dim'}`}>
              {isInsured ? 'Active' : 'None'}
            </span>
          </div>
        </motion.div>

        {/* Insurance Link */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full card-bordered p-4 flex items-center justify-between mb-4"
          onClick={() => {
            haptics.light();
            navigate('/insurance');
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neon/10 flex items-center justify-center">
              <Shield size={20} className="text-neon" />
            </div>
            <div className="text-left">
              <p className="font-medium text-sm">
                {isInsured ? 'Manage Insurance' : 'Get Insurance'}
              </p>
              <p className="text-text-dim text-xs">
                {isInsured
                  ? `${Math.round((insurancePolicy?.coverage || 0) * 100)}% coverage active`
                  : 'Protect against losses'}
              </p>
            </div>
          </div>
          <ChevronRight size={20} className="text-text-dim" />
        </motion.button>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-4"
        >
          <p className="text-text-dim text-sm">
            Mix different game types to keep attackers guessing
          </p>
        </motion.div>
      </div>
    </div>
  );
};
