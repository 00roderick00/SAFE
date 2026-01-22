import { motion } from 'framer-motion';
import { Shield, Lock, AlertTriangle, Clock } from 'lucide-react';
import { Card, CircularProgress } from '../ui';
import { usePlayerStore } from '../../store/playerStore';
import { calculateEconomyStats } from '../../game/economy';
import { formatDistanceToNow } from 'date-fns';

export const SafeCard = () => {
  const {
    safeBalance,
    securityLoadout,
    insurancePolicy,
    heistModeActive,
    heistModeExpiresAt,
  } = usePlayerStore();

  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const securityPercentage = (stats.securityScore / 100) * 100;

  const formatBalance = (balance: number) => {
    if (balance >= 1000000) return `${(balance / 1000000).toFixed(1)}M`;
    if (balance >= 1000) return `${(balance / 1000).toFixed(1)}K`;
    return balance.toLocaleString();
  };

  const getTimeRemaining = () => {
    if (!heistModeExpiresAt) return null;
    const remaining = heistModeExpiresAt - Date.now();
    if (remaining <= 0) return null;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isInsuranceActive =
    insurancePolicy && Date.now() < insurancePolicy.expiresAt;

  return (
    <Card variant="elevated" className="relative overflow-hidden">
      {/* Background safe graphic */}
      <div className="absolute inset-0 opacity-5">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="0.5" />
          <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>

      <div className="relative z-10">
        {/* Heist Mode Alert */}
        {heistModeActive && (
          <motion.div
            className="flex items-center gap-2 mb-4 px-3 py-2 bg-danger/20 border border-danger/30 rounded-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertTriangle size={18} className="text-danger" />
            <span className="text-sm text-danger font-medium">
              HEIST MODE ACTIVE
            </span>
            {getTimeRemaining() && (
              <span className="ml-auto text-sm text-danger flex items-center gap-1">
                <Clock size={14} />
                {getTimeRemaining()}
              </span>
            )}
          </motion.div>
        )}

        {/* Main content */}
        <div className="flex items-center gap-4">
          {/* Security Score Circle */}
          <CircularProgress
            value={securityPercentage}
            size={100}
            strokeWidth={8}
            variant={securityPercentage > 60 ? 'primary' : securityPercentage > 30 ? 'warning' : 'danger'}
            label="Security"
          />

          {/* Balance and Stats */}
          <div className="flex-1">
            <div className="mb-3">
              <p className="text-text-dim text-sm">Safe Balance</p>
              <p className="font-display text-3xl font-bold text-text neon-text-primary">
                {formatBalance(safeBalance)}
                <span className="text-lg text-primary ml-1">tokens</span>
              </p>
            </div>

            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-text-dim">Est. Income/day</p>
                <p className="font-medium text-primary">
                  +{stats.estimatedFailIncomePerDay}
                </p>
              </div>
              <div>
                <p className="text-text-dim">Breach Risk/day</p>
                <p className="font-medium text-danger">
                  -{stats.estimatedBreachRiskPerDay}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-primary/10">
          {/* Module count */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-light rounded-lg">
            <Lock size={14} className="text-primary" />
            <span className="text-xs text-text">
              {securityLoadout.modules.length} Locks
            </span>
          </div>

          {/* Insurance status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              isInsuranceActive
                ? 'bg-primary/20 text-primary'
                : 'bg-surface-light text-text-dim'
            }`}
          >
            <Shield size={14} />
            <span className="text-xs">
              {isInsuranceActive
                ? `Insured (${Math.round(insurancePolicy!.coverage * 100)}%)`
                : 'Not Insured'}
            </span>
          </div>

          {/* Attack fee indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-light rounded-lg ml-auto">
            <span className="text-xs text-text-dim">Attack Fee:</span>
            <span className="text-xs font-medium text-warning">
              {stats.attackFee}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
