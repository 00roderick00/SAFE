import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crosshair, Shield, ShieldCheck, TrendingUp, AlertCircle, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { SafeCard } from '../components/safe/SafeCard';
import { Button, Card, ConfirmModal } from '../components/ui';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { calculateEconomyStats } from '../game/economy';
import { ECONOMY } from '../game/constants';

export const HomeScreen = () => {
  const navigate = useNavigate();
  const [showHeistConfirm, setShowHeistConfirm] = useState(false);

  const {
    safeBalance,
    securityLoadout,
    insurancePolicy,
    heistModeActive,
    heistModeExpiresAt,
    enterHeistMode,
    exitHeistMode,
    totalEarnings,
    successfulDefenses,
    addEarnings,
  } = usePlayerStore();

  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const isInsured = insurancePolicy && Date.now() < insurancePolicy.expiresAt;

  const { simulateDefense, addDefenseEvent, addNotification, refreshBotSafes, botSafes } =
    useGameStore();

  // Check heist mode expiry
  useEffect(() => {
    if (heistModeActive && heistModeExpiresAt && Date.now() > heistModeExpiresAt) {
      exitHeistMode();
      addNotification({
        type: 'heist_ended',
        title: 'Heist Mode Ended',
        message: 'Your heist session has expired. Your safe is now protected.',
      });
    }
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
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [heistModeActive, safeBalance, simulateDefense, addDefenseEvent, addNotification, addEarnings]);

  // Refresh bot safes on mount
  useEffect(() => {
    if (botSafes.length === 0) {
      const rating = usePlayerStore.getState().riskRating;
      refreshBotSafes(rating);
    }
  }, [botSafes.length, refreshBotSafes]);

  const handleEnterHeistMode = () => {
    setShowHeistConfirm(true);
  };

  const confirmHeistMode = () => {
    enterHeistMode();
    navigate('/heist');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} minutes`;
  };

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="Your Safe"
        subtitle="Protect your tokens and earn from failed attacks"
      />

      {/* Main Safe Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SafeCard />
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        className="mt-6 space-y-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {heistModeActive ? (
          <Button
            variant="danger"
            fullWidth
            size="lg"
            onClick={() => navigate('/heist')}
          >
            <Crosshair className="mr-2" size={20} />
            Continue Heist
          </Button>
        ) : (
          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={handleEnterHeistMode}
          >
            <Crosshair className="mr-2" size={20} />
            Enter Heist Mode
          </Button>
        )}

        <Button
          variant="secondary"
          fullWidth
          size="lg"
          onClick={() => navigate('/security')}
        >
          <Shield className="mr-2" size={20} />
          Configure Security
        </Button>
      </motion.div>

      {/* Insurance Status/Recommendation */}
      <motion.div
        className="mt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        {isInsured ? (
          <Card
            variant="default"
            padding="sm"
            className="border-l-4 border-l-primary cursor-pointer"
            onClick={() => navigate('/insurance')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                <span className="text-sm text-primary font-medium">
                  Insured ({Math.round(insurancePolicy!.coverage * 100)}%)
                </span>
              </div>
              <span className="text-xs text-text-dim">
                {insurancePolicy!.claimsRemaining} claims left
              </span>
            </div>
          </Card>
        ) : stats.recommendedInsurance ? (
          <Card
            variant="default"
            padding="sm"
            className="border-l-4 border-l-warning cursor-pointer"
            onClick={() => navigate('/insurance')}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <div className="flex-1">
                <span className="text-sm text-warning font-medium">
                  Insurance Recommended
                </span>
                <p className="text-xs text-text-dim">
                  Your breach risk exceeds potential income
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card
            variant="default"
            padding="sm"
            className="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => navigate('/insurance')}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-text-dim" />
              <span className="text-sm text-text-dim">
                No insurance - Tap to get covered
              </span>
            </div>
          </Card>
        )}
      </motion.div>

      {/* Warning when not in heist mode */}
      {!heistModeActive && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card variant="default" padding="sm">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-text font-medium">Safe is Protected</p>
                <p className="text-text-dim mt-1">
                  Your safe cannot be attacked while you&apos;re not in Heist Mode.
                  Enter Heist Mode to attack others and earn tokens.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Quick Stats */}
      <motion.div
        className="mt-6 grid grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card variant="default" padding="sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-primary" />
            <span className="text-xs text-text-dim">Total Earned</span>
          </div>
          <p className="font-display text-xl font-bold text-primary">
            {totalEarnings.toLocaleString()}
          </p>
        </Card>

        <Card variant="default" padding="sm">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-primary" />
            <span className="text-xs text-text-dim">Defenses Won</span>
          </div>
          <p className="font-display text-xl font-bold text-primary">
            {successfulDefenses}
          </p>
        </Card>
      </motion.div>

      {/* Heist Mode Confirmation Modal */}
      <ConfirmModal
        open={showHeistConfirm}
        onOpenChange={setShowHeistConfirm}
        title="Enter Heist Mode?"
        message={`Your safe will be vulnerable to attacks for ${formatDuration(
          ECONOMY.heistDuration
        )}. You'll be able to attack other safes and earn tokens from failed attacks on yours.`}
        confirmLabel="Start Heist"
        onConfirm={confirmHeistMode}
        variant="danger"
      />
    </div>
  );
};
