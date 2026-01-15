import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  AlertTriangle,
  Clock,
  Coins,
  Shield,
  Target,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Card, Button, ConfirmModal } from '../components/ui';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { BotSafe } from '../types';
import { calculateLoot } from '../game/economy';
import { ECONOMY } from '../game/constants';

const difficultyColors = {
  soft: 'text-primary bg-primary/10',
  tricky: 'text-warning bg-warning/10',
  brutal: 'text-danger bg-danger/10',
};

const successChanceColors = {
  low: 'text-danger',
  medium: 'text-warning',
  high: 'text-primary',
};

const lootColors = {
  small: 'text-text-dim',
  moderate: 'text-warning',
  rich: 'text-primary',
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
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    refreshBotSafes(riskRating);
    setRefreshing(false);
  };

  const handleSelectTarget = (safe: BotSafe) => {
    if (safe.attackFee > safeBalance) return;
    setSelectedTarget(safe);
  };

  const handleConfirmAttack = () => {
    if (!selectedTarget) return;

    // Deduct stake
    usePlayerStore.getState().withdrawTokens(selectedTarget.attackFee);

    // Start attack
    startAttack(selectedTarget, selectedTarget.attackFee);
    recordBotAttacked(selectedTarget.id);

    // Navigate to attack screen
    navigate('/attack');
  };

  const getTimeRemaining = () => {
    if (!heistModeExpiresAt) return '0:00';
    const remaining = heistModeExpiresAt - Date.now();
    if (remaining <= 0) return '0:00';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="Heist Mode"
        subtitle="Choose a target and crack their safe"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              size={18}
              className={refreshing ? 'animate-spin' : ''}
            />
          </Button>
        }
      />

      {/* Heist Mode Status */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card variant="elevated" padding="sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-danger" />
              <span className="text-sm text-danger font-medium">
                Your safe is vulnerable
              </span>
            </div>
            <div className="flex items-center gap-2 text-danger">
              <Clock size={16} />
              <span className="font-display font-bold">
                {getTimeRemaining()}
              </span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Your Balance */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-dim">Your Balance:</span>
          <span className="font-display font-bold text-primary">
            {safeBalance.toLocaleString()} tokens
          </span>
        </div>
      </motion.div>

      {/* Target List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="font-display text-lg font-semibold text-text mb-3">
          Available Targets
        </h2>

        <div className="space-y-3">
          <AnimatePresence>
            {botSafes.map((safe, index) => {
              const canAfford = safe.attackFee <= safeBalance;
              const wasRecentlyAttacked = recentlyAttacked.includes(safe.id);
              const potentialLoot = calculateLoot(safe.safeBalance);

              return (
                <motion.div
                  key={safe.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    variant={canAfford ? 'default' : 'default'}
                    padding="md"
                    className={`
                      cursor-pointer transition-all
                      ${canAfford ? 'hover:border-primary/30' : 'opacity-50'}
                      ${wasRecentlyAttacked ? 'border-warning/30' : ''}
                    `}
                    onClick={() => handleSelectTarget(safe)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Safe Icon */}
                      <div className="w-12 h-12 rounded-lg bg-surface-light flex items-center justify-center">
                        <Target size={24} className="text-primary" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-display font-semibold text-text truncate">
                            {safe.ownerName}
                          </span>
                          {wasRecentlyAttacked && (
                            <span className="text-xs text-warning">
                              (attacked)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {/* Difficulty */}
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              difficultyColors[safe.difficultyBand]
                            }`}
                          >
                            {safe.difficultyBand}
                          </span>

                          {/* Loot range */}
                          <span
                            className={`text-xs flex items-center gap-1 ${
                              lootColors[safe.lootRange]
                            }`}
                          >
                            <Coins size={12} />
                            {safe.lootRange}
                          </span>

                          {/* Success chance */}
                          <span
                            className={`text-xs ${
                              successChanceColors[safe.successChance]
                            }`}
                          >
                            {safe.successChance} chance
                          </span>
                        </div>
                      </div>

                      {/* Stake & Action */}
                      <div className="text-right">
                        <div className="text-xs text-text-dim mb-1">Stake</div>
                        <div
                          className={`font-display font-bold ${
                            canAfford ? 'text-warning' : 'text-danger'
                          }`}
                        >
                          {safe.attackFee}
                        </div>
                        <ChevronRight
                          size={20}
                          className={`ml-auto mt-1 ${
                            canAfford ? 'text-primary' : 'text-text-dim'
                          }`}
                        />
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {botSafes.length === 0 && (
          <Card variant="default" padding="lg" className="text-center">
            <p className="text-text-dim mb-4">No targets available</p>
            <Button variant="secondary" onClick={handleRefresh}>
              <RefreshCw size={16} className="mr-2" />
              Find Targets
            </Button>
          </Card>
        )}
      </motion.div>

      {/* Attack Confirmation Modal */}
      <ConfirmModal
        open={!!selectedTarget}
        onOpenChange={() => setSelectedTarget(null)}
        title="Confirm Attack"
        message={
          selectedTarget
            ? `Attack ${selectedTarget.ownerName}'s safe? You'll stake ${
                selectedTarget.attackFee
              } tokens. Potential loot: ~${Math.round(
                calculateLoot(selectedTarget.safeBalance)
              )} tokens.`
            : ''
        }
        confirmLabel="Start Attack"
        onConfirm={handleConfirmAttack}
        variant="danger"
      />
    </div>
  );
};
