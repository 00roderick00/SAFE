// Heist Screen - Danger Mode with Target Cards
// Features: Red danger state, watchlist-style targets, difficulty bars

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  AlertTriangle,
  Clock,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { BotSafe } from '../types';
import { calculateLoot } from '../game/economy';
import { haptics } from '../utils/haptics';

// Difficulty bar component
const DifficultyBar = ({ level }: { level: 'soft' | 'tricky' | 'brutal' }) => {
  const filled = level === 'soft' ? 1 : level === 'tricky' ? 2 : 3;
  const color = level === 'soft' ? 'easy' : level === 'tricky' ? 'medium' : 'hard';

  return (
    <div className="difficulty-bar">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`difficulty-segment ${i <= filled ? `filled ${color}` : ''}`}
        />
      ))}
    </div>
  );
};

// Target avatar with initials
const TargetAvatar = ({ name, difficulty }: { name: string; difficulty: string }) => {
  const initials = name.slice(0, 2).toUpperCase();
  const bgColor = difficulty === 'soft' ? 'bg-profit/10' :
                  difficulty === 'tricky' ? 'bg-warning/10' : 'bg-loss/10';

  return (
    <div className={`target-avatar ${bgColor}`}>
      <span className="text-sm font-semibold text-text-dim">{initials}</span>
    </div>
  );
};

export const HeistScreen = () => {
  const navigate = useNavigate();
  const [selectedTarget, setSelectedTarget] = useState<BotSafe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    heistModeActive,
    heistModeExpiresAt,
    safeBalance,
    riskRating,
    exitHeistMode,
  } = usePlayerStore();

  const { botSafes, refreshBotSafes, recentlyAttacked, recordBotAttacked } =
    useGameStore();

  const { startAttack } = useHeistStore();

  // Redirect if not in heist mode
  useEffect(() => {
    if (!heistModeActive) {
      navigate('/');
    }
  }, [heistModeActive, navigate]);

  // Check for heist mode expiry
  useEffect(() => {
    if (heistModeExpiresAt && Date.now() > heistModeExpiresAt) {
      exitHeistMode();
      navigate('/');
    }
  }, [heistModeExpiresAt, exitHeistMode, navigate]);

  const handleRefresh = async () => {
    haptics.light();
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    refreshBotSafes(riskRating);
    setRefreshing(false);
  };

  const handleSelectTarget = (safe: BotSafe) => {
    if (safe.attackFee > safeBalance) return;
    haptics.medium();
    setSelectedTarget(safe);
  };

  const handleConfirmAttack = () => {
    if (!selectedTarget) return;
    haptics.heavy();

    // Deduct stake
    usePlayerStore.getState().withdrawTokens(selectedTarget.attackFee);

    // Start attack
    startAttack(selectedTarget, selectedTarget.attackFee);
    recordBotAttacked(selectedTarget.id);

    // Navigate to attack screen
    navigate('/attack');
  };

  const handleCancelAttack = () => {
    haptics.light();
    setSelectedTarget(null);
  };

  const getTimeRemaining = () => {
    if (!heistModeExpiresAt) return '0:00';
    const remaining = heistModeExpiresAt - Date.now();
    if (remaining <= 0) return '0:00';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatValue = (value: number) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value}`;
  };

  return (
    <div className="min-h-screen danger-mode pb-32">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-4">
        <div className="flex items-center justify-between">
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
            <h1 className="ml-2 text-lg font-semibold">Attack</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-text-dim hover:text-text disabled:opacity-50"
          >
            <RefreshCw
              size={20}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </header>

      {/* Danger Banner */}
      <div className="px-4 mt-2">
        <div className="danger-banner">
          <div className="danger-banner-text">
            <AlertTriangle size={18} />
            <span>VAULT EXPOSED</span>
          </div>
          <div className="danger-banner-timer">
            <Clock size={14} className="inline mr-1" />
            {getTimeRemaining()}
          </div>
        </div>
      </div>

      {/* Available Balance */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-dim">Available to stake</span>
          <span className="font-semibold">${safeBalance.toLocaleString()}</span>
        </div>
      </div>

      {/* Targets Section */}
      <div className="px-4 mt-6">
        <p className="section-label mb-3">Targets</p>

        {botSafes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card-bordered p-8 text-center"
          >
            <EmptyTargetsIcon />
            <p className="text-text font-medium mt-4">No targets found</p>
            <p className="text-text-dim text-sm mt-1">Refresh to find new targets</p>
            <button
              className="btn-secondary mt-4"
              onClick={handleRefresh}
            >
              <RefreshCw size={16} className="mr-2" />
              Find Targets
            </button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {botSafes.map((safe, index) => {
              const canAfford = safe.attackFee <= safeBalance;
              const wasRecentlyAttacked = recentlyAttacked.includes(safe.id);
              const potentialLoot = calculateLoot(safe.safeBalance);

              return (
                <motion.div
                  key={safe.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <button
                    className={`target-card w-full ${!canAfford ? 'opacity-50' : ''}`}
                    onClick={() => handleSelectTarget(safe)}
                    disabled={!canAfford}
                  >
                    <TargetAvatar name={safe.ownerName} difficulty={safe.difficultyBand} />

                    <div className="target-info">
                      <div className="flex items-center gap-2">
                        <span className="target-name">{safe.ownerName}</span>
                        {wasRecentlyAttacked && (
                          <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                            recent
                          </span>
                        )}
                      </div>
                      {safe.tagline && (
                        <p className="target-tagline truncate">"{safe.tagline}"</p>
                      )}
                      <DifficultyBar level={safe.difficultyBand} />
                    </div>

                    <div className="target-stats">
                      <div className="target-value">{formatValue(safe.safeBalance)}</div>
                      <div className="target-stake">
                        Stake: ${safe.attackFee}
                      </div>
                    </div>

                    <ChevronRight size={20} className="ml-2 text-text-dim" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Attack Confirmation Modal */}
      <AnimatePresence>
        {selectedTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60"
            onClick={handleCancelAttack}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-lg bg-surface rounded-t-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold mb-2">Confirm Attack</h3>
                <p className="text-text-dim">
                  Attack <span className="text-text font-medium">{selectedTarget.ownerName}</span>?
                </p>
              </div>

              <div className="card-bordered p-4 mb-6">
                <div className="stat-row">
                  <span className="stat-label">Your Stake</span>
                  <span className="stat-value text-loss">-${selectedTarget.attackFee}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Potential Loot</span>
                  <span className="stat-value text-profit">
                    ~${Math.round(calculateLoot(selectedTarget.safeBalance))}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Difficulty</span>
                  <span className="stat-value capitalize">{selectedTarget.difficultyBand}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={handleCancelAttack}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger flex-1"
                  onClick={handleConfirmAttack}
                >
                  Attack
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Action Bar */}
      <div className="action-bar">
        <button
          className="btn-secondary"
          onClick={() => {
            haptics.light();
            exitHeistMode();
            navigate('/');
          }}
        >
          Exit Heist Mode
        </button>
      </div>
    </div>
  );
};

// Empty state icon
const EmptyTargetsIcon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    className="mx-auto opacity-40"
  >
    <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
    <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="2" />
    <circle cx="32" cy="32" r="4" fill="currentColor" />
    <line x1="32" y1="4" x2="32" y2="12" stroke="currentColor" strokeWidth="2" />
    <line x1="32" y1="52" x2="32" y2="60" stroke="currentColor" strokeWidth="2" />
    <line x1="4" y1="32" x2="12" y2="32" stroke="currentColor" strokeWidth="2" />
    <line x1="52" y1="32" x2="60" y2="32" stroke="currentColor" strokeWidth="2" />
  </svg>
);
