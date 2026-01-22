// Home Screen - Portfolio Style with Safe Graphic
// Features: Safe with balance inside, contained earnings graph, activity feed

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Shield, AlertTriangle, Clock, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { ActivityFeed } from '../components/ActivityFeed';
import { SafeGraphic } from '../components/SafeGraphic';
import { EarningsGraph, TimeRangePills, generateSampleData, filterDataByRange } from '../components/EarningsGraph';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { calculateEconomyStats } from '../game/economy';
import { haptics } from '../utils/haptics';

type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | 'ALL';

export const HomeScreen = () => {
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1W');

  const {
    safeBalance,
    securityLoadout,
    insurancePolicy,
    heistModeActive,
    heistModeExpiresAt,
    exitHeistMode,
    enterHeistMode,
    totalEarnings,
    addEarnings,
  } = usePlayerStore();

  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const isInsured = insurancePolicy && Date.now() < insurancePolicy.expiresAt;

  const { simulateDefense, addDefenseEvent, addNotification, refreshBotSafes, botSafes } =
    useGameStore();

  // Generate sample earnings data
  const allEarningsData = useMemo(() => {
    return generateSampleData(365, safeBalance * 0.7, 0.03);
  }, [safeBalance]);

  const filteredData = useMemo(() => {
    return filterDataByRange(allEarningsData, timeRange);
  }, [allEarningsData, timeRange]);

  // Calculate period change
  const periodChange = useMemo(() => {
    if (filteredData.length < 2) return { amount: 0, percent: 0 };
    const first = filteredData[0].value;
    const last = filteredData[filteredData.length - 1].value;
    return {
      amount: last - first,
      percent: first > 0 ? ((last - first) / first) * 100 : 0,
    };
  }, [filteredData]);

  // Handle time range change
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    haptics.selection();
    setTimeRange(range);
  }, []);

  // Update countdown timer
  useEffect(() => {
    if (!heistModeActive || !heistModeExpiresAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = heistModeExpiresAt - Date.now();
      if (remaining <= 0) {
        setTimeRemaining(null);
        exitHeistMode();
        addNotification({
          type: 'heist_ended',
          title: 'Heist Mode Ended',
          message: 'Your heist session has expired. Your safe is now protected.',
        });
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [heistModeActive, heistModeExpiresAt, exitHeistMode, addNotification]);

  // Simulate occasional attacks when in heist mode
  useEffect(() => {
    if (!heistModeActive) return;

    const interval = setInterval(() => {
      const securityScore = usePlayerStore.getState().securityLoadout.effectiveScore;
      const defenseResult = simulateDefense(safeBalance, securityScore);

      if (defenseResult) {
        addDefenseEvent(defenseResult);

        if (defenseResult.success) {
          addEarnings(defenseResult.feeEarned);
          addNotification({
            type: 'defense_success',
            title: 'Attack Defended!',
            message: `${defenseResult.attackerName} failed to breach your safe. You earned ${defenseResult.feeEarned} tokens.`,
          });
        } else {
          usePlayerStore.getState().recordLoss(defenseResult.lootLost);
          addNotification({
            type: 'defense_fail',
            title: 'Safe Breached!',
            message: `${defenseResult.attackerName} breached your safe and stole ${defenseResult.lootLost} tokens.`,
          });
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [heistModeActive, safeBalance, simulateDefense, addDefenseEvent, addNotification, addEarnings]);

  // Refresh bot safes on mount
  useEffect(() => {
    if (botSafes.length === 0) {
      const rating = usePlayerStore.getState().riskRating;
      refreshBotSafes(rating);
    }
  }, [botSafes.length, refreshBotSafes]);

  const isProfit = periodChange.amount >= 0;

  return (
    <div className={`min-h-screen pb-32 ${heistModeActive ? 'danger-mode' : ''}`}>
      {/* Danger Banner - Heist Mode Active */}
      <AnimatePresence>
        {heistModeActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="danger-banner mx-4 mt-4">
              <div className="danger-banner-text">
                <AlertTriangle size={18} />
                <span>VAULT EXPOSED</span>
              </div>
              {timeRemaining && (
                <div className="danger-banner-timer">{timeRemaining}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">SAFE</h1>
        <button
          onClick={() => {
            haptics.light();
            navigate('/security');
          }}
          className="p-2 text-text-dim hover:text-text transition-colors"
        >
          <Settings size={22} />
        </button>
      </header>

      {/* Safe Graphic with Balance */}
      <motion.div
        className="flex justify-center py-4"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <SafeGraphic
          size={180}
          isVulnerable={heistModeActive}
          balance={safeBalance}
        />
      </motion.div>

      {/* Period Change Indicator */}
      <motion.div
        className="text-center mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <p className={`text-sm font-medium ${isProfit ? 'text-profit' : 'text-loss'}`}>
          {isProfit ? '+' : ''}{periodChange.percent.toFixed(1)}% this {timeRange === '1D' ? 'day' : timeRange === '1W' ? 'week' : 'period'}
        </p>
      </motion.div>

      {/* Earnings Graph Card - Contained */}
      <motion.div
        className="mx-4 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="card-bordered p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Performance</span>
            <span className={`text-sm font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>
              {isProfit ? '+' : ''}${Math.abs(periodChange.amount).toFixed(0)}
            </span>
          </div>

          <EarningsGraph
            data={filteredData}
            height={120}
          />

          <TimeRangePills
            selected={timeRange}
            onChange={handleTimeRangeChange}
          />
        </div>
      </motion.div>

      {/* Quick Stats Row */}
      <motion.div
        className="mx-4 mb-6 grid grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          className="card-bordered p-4 text-left"
          onClick={() => {
            haptics.light();
            navigate('/security');
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-neon" />
            <span className="text-xs text-text-dim">Security</span>
          </div>
          <p className="font-semibold">{Math.round(stats.securityScore)}/100</p>
        </button>

        <button
          className="card-bordered p-4 text-left"
          onClick={() => {
            haptics.light();
            navigate('/insurance');
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className={isInsured ? 'text-profit' : 'text-text-dim'} />
            <span className="text-xs text-text-dim">Insurance</span>
          </div>
          <p className={`font-semibold ${isInsured ? 'text-profit' : ''}`}>
            {isInsured ? 'Active' : 'None'}
          </p>
        </button>
      </motion.div>

      {/* Activity Section */}
      <motion.div
        className="px-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="section-label">Activity</span>
          <button
            className="text-xs text-text-dim hover:text-text"
            onClick={() => navigate('/history')}
          >
            See all
          </button>
        </div>
        <ActivityFeed />
      </motion.div>

      {/* Fixed Action Bar */}
      <div className="action-bar">
        {heistModeActive ? (
          <>
            <button
              className="btn-danger"
              onClick={() => {
                haptics.medium();
                navigate('/heist');
              }}
            >
              <Target size={18} className="mr-2" />
              Continue Heist
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                haptics.light();
                exitHeistMode();
              }}
            >
              Exit
            </button>
          </>
        ) : (
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                haptics.light();
                navigate('/security');
              }}
            >
              <Shield size={18} className="mr-2" />
              Defend
            </button>
            <button
              className="btn-neon"
              onClick={() => {
                haptics.medium();
                enterHeistMode();
                navigate('/heist');
              }}
            >
              <Target size={18} className="mr-2" />
              Attack
            </button>
          </>
        )}
      </div>
    </div>
  );
};
