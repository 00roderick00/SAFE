import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Coins,
  Info,
} from 'lucide-react';
import { formatDistanceToNow, addSeconds } from 'date-fns';
import { PageHeader } from '../components/Layout';
import { Card, Button, ConfirmModal, CircularProgress } from '../components/ui';
import { usePlayerStore } from '../store/playerStore';
import { calculateInsurancePremium, calculateEconomyStats } from '../game/economy';
import { INSURANCE_PLANS, ECONOMY } from '../game/constants';
import { InsurancePolicy } from '../types';

export const InsuranceScreen = () => {
  const [selectedPlan, setSelectedPlan] = useState<typeof INSURANCE_PLANS[number] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    safeBalance,
    securityLoadout,
    insurancePolicy,
    purchaseInsurance,
    clearInsurance,
  } = usePlayerStore();

  const stats = calculateEconomyStats(safeBalance, securityLoadout);

  const isInsuranceActive = insurancePolicy && Date.now() < insurancePolicy.expiresAt;

  const calculatePremium = (plan: typeof INSURANCE_PLANS[number]) => {
    return calculateInsurancePremium(
      safeBalance,
      stats.securityScore,
      plan.duration,
      plan.coverage
    );
  };

  const handleSelectPlan = (plan: typeof INSURANCE_PLANS[number]) => {
    const premium = calculatePremium(plan);
    if (premium > safeBalance) return;
    setSelectedPlan(plan);
    setShowConfirm(true);
  };

  const handlePurchase = () => {
    if (!selectedPlan) return;

    const premium = calculatePremium(selectedPlan);
    const now = Date.now();

    const policy: InsurancePolicy = {
      id: `insurance-${now}`,
      coverage: selectedPlan.coverage,
      premium,
      duration: selectedPlan.duration,
      purchasedAt: now,
      expiresAt: now + selectedPlan.duration * 1000,
      maxPayout: safeBalance * ECONOMY.lootFraction * selectedPlan.coverage,
      claimsRemaining: 3, // Allow up to 3 claims per policy
    };

    purchaseInsurance(policy);
    setSelectedPlan(null);
  };

  const formatDuration = (seconds: number) => {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} day`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 60)} min`;
  };

  const getTimeRemaining = () => {
    if (!insurancePolicy) return null;
    const remaining = insurancePolicy.expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    return formatDistanceToNow(insurancePolicy.expiresAt, { addSuffix: false }) + ' left';
  };

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="Insurance"
        subtitle="Protect your tokens from heists"
      />

      {/* Current Policy Status */}
      {isInsuranceActive && insurancePolicy && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card variant="neon" padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={20} className="text-primary" />
              <span className="font-display font-semibold text-primary">
                Active Policy
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-text-dim">Coverage</p>
                <p className="font-display text-xl font-bold text-text">
                  {Math.round(insurancePolicy.coverage * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-text-dim">Time Remaining</p>
                <p className="font-display text-xl font-bold text-warning">
                  {getTimeRemaining()}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-dim">Max Payout</p>
                <p className="font-display text-lg font-bold text-text">
                  {Math.round(insurancePolicy.maxPayout)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-dim">Claims Left</p>
                <p className="font-display text-lg font-bold text-text">
                  {insurancePolicy.claimsRemaining}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
              <CheckCircle size={16} className="text-primary" />
              <span className="text-sm text-primary">
                You're protected until{' '}
                {new Date(insurancePolicy.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Risk Assessment */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <Card variant="elevated" padding="md">
          <div className="flex items-center gap-3 mb-4">
            <CircularProgress
              value={stats.securityScore}
              size={60}
              strokeWidth={5}
              variant={stats.recommendedInsurance ? 'warning' : 'primary'}
              showValue={false}
            />
            <div>
              <h3 className="font-display font-semibold text-text">
                Risk Assessment
              </h3>
              <p className="text-sm text-text-dim">
                Based on your current security: {stats.securityScore.toFixed(0)}/100
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger" />
              <span className="text-text-dim">Est. Risk/day:</span>
              <span className="text-danger font-medium">
                -{stats.estimatedBreachRiskPerDay}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-text-dim">Est. Income/day:</span>
              <span className="text-primary font-medium">
                +{stats.estimatedFailIncomePerDay}
              </span>
            </div>
          </div>

          {stats.recommendedInsurance && !isInsuranceActive && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <span className="text-sm text-warning">
                Your breach risk exceeds income. Insurance is recommended.
              </span>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Insurance Plans */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="font-display text-lg font-semibold text-text mb-3">
          {isInsuranceActive ? 'Upgrade Policy' : 'Choose a Plan'}
        </h2>

        <div className="space-y-3">
          {INSURANCE_PLANS.map((plan, index) => {
            const premium = calculatePremium(plan);
            const canAfford = premium <= safeBalance;
            const maxPayout = Math.round(
              safeBalance * ECONOMY.lootFraction * plan.coverage
            );

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
              >
                <Card
                  variant={canAfford ? 'default' : 'default'}
                  padding="md"
                  className={`
                    cursor-pointer transition-all
                    ${canAfford ? 'hover:border-primary/30' : 'opacity-50'}
                  `}
                  onClick={() => handleSelectPlan(plan)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`
                          w-12 h-12 rounded-lg flex items-center justify-center
                          ${index === 2 ? 'bg-primary/20' : 'bg-surface-light'}
                        `}
                      >
                        <Clock
                          size={24}
                          className={index === 2 ? 'text-primary' : 'text-text-dim'}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-semibold text-text">
                            {plan.name}
                          </span>
                          {index === 2 && (
                            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">
                              Best Value
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-dim">
                          {Math.round(plan.coverage * 100)}% coverage
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-display font-bold ${
                          canAfford ? 'text-warning' : 'text-danger'
                        }`}
                      >
                        {premium}
                      </div>
                      <p className="text-xs text-text-dim">tokens</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-primary/10 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-text-dim">Max Payout:</span>
                      <span className="ml-1 text-text font-medium">
                        {maxPayout}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-dim">Duration:</span>
                      <span className="ml-1 text-text font-medium">
                        {formatDuration(plan.duration)}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Info Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-6"
      >
        <Card variant="default" padding="md">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-text-dim">
              <p className="font-medium text-text mb-2">How Insurance Works</p>
              <ul className="space-y-1">
                <li>• Covers {Math.round(ECONOMY.insurance.coverage * 100)}% of losses when your safe is breached</li>
                <li>• Premium is based on your safe value and security score</li>
                <li>• Higher security = lower premiums</li>
                <li>• Each policy allows up to 3 claims</li>
                <li>• Attackers still receive their loot (paid from insurance pool)</li>
              </ul>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Your Balance */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4"
      >
        <div className="flex items-center justify-between text-sm px-2">
          <span className="text-text-dim">Your Balance:</span>
          <span className="font-display font-bold text-primary">
            {safeBalance.toLocaleString()} tokens
          </span>
        </div>
      </motion.div>

      {/* Purchase Confirmation Modal */}
      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Purchase Insurance?"
        message={
          selectedPlan
            ? `Buy ${selectedPlan.name} insurance for ${calculatePremium(
                selectedPlan
              )} tokens? This will cover ${Math.round(
                selectedPlan.coverage * 100
              )}% of any losses for ${formatDuration(selectedPlan.duration)}.`
            : ''
        }
        confirmLabel="Purchase"
        onConfirm={handlePurchase}
        variant="primary"
      />
    </div>
  );
};
