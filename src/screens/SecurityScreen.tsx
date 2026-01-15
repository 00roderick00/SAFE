import { motion } from 'framer-motion';
import { Grid3X3, Keyboard, Clock, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Card, CardHeader, DifficultySlider, CircularProgress, Button } from '../components/ui';
import { usePlayerStore } from '../store/playerStore';
import { calculateEconomyStats } from '../game/economy';
import { MODULE_CONFIG } from '../game/constants';
import { ModuleType } from '../types';

const moduleIcons: Record<ModuleType, typeof Grid3X3> = {
  pattern: Grid3X3,
  keypad: Keyboard,
  timing: Clock,
};

export const SecurityScreen = () => {
  const { securityLoadout, setModuleDifficulty, safeBalance } = usePlayerStore();
  const stats = calculateEconomyStats(safeBalance, securityLoadout);

  const getDifficultyLabel = (value: number): string => {
    if (value < 0.33) return 'Easy';
    if (value < 0.66) return 'Medium';
    return 'Hard';
  };

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="Security"
        subtitle="Configure your safe's defenses"
      />

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card variant="elevated" padding="md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CircularProgress
                value={stats.securityScore}
                size={80}
                strokeWidth={6}
                variant={
                  stats.securityScore > 60
                    ? 'primary'
                    : stats.securityScore > 30
                    ? 'warning'
                    : 'danger'
                }
                label="Score"
              />
              <div>
                <h3 className="font-display text-lg font-semibold text-text">
                  Security Score
                </h3>
                <p className="text-sm text-text-dim">
                  {stats.securityScore > 60
                    ? 'Strong protection'
                    : stats.securityScore > 30
                    ? 'Moderate risk'
                    : 'High risk of breach'}
                </p>
              </div>
            </div>
          </div>

          {/* Projected Outcomes */}
          <div className="mt-4 pt-4 border-t border-primary/10 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              <div>
                <p className="text-xs text-text-dim">Est. Income/day</p>
                <p className="font-display font-semibold text-primary">
                  +{stats.estimatedFailIncomePerDay}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown size={18} className="text-danger" />
              <div>
                <p className="text-xs text-text-dim">Est. Risk/day</p>
                <p className="font-display font-semibold text-danger">
                  -{stats.estimatedBreachRiskPerDay}
                </p>
              </div>
            </div>
          </div>

          {/* Insurance recommendation */}
          {stats.recommendedInsurance && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg">
              <Shield size={16} className="text-warning" />
              <span className="text-sm text-warning">
                Insurance recommended for this security level
              </span>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Security Modules */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="font-display text-lg font-semibold text-text mb-3">
          Security Modules
        </h2>
        <p className="text-sm text-text-dim mb-4">
          Adjust the difficulty of each lock. Harder locks provide better protection
          but attract fewer attackers (and less potential income).
        </p>

        <div className="space-y-4">
          {securityLoadout.modules.map((module, index) => {
            const Icon = moduleIcons[module.type];
            const config = MODULE_CONFIG[module.type];

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
              >
                <Card variant="default" padding="md">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon size={24} className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display font-semibold text-text">
                        {module.name}
                      </h3>
                      <p className="text-sm text-text-dim">
                        {module.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-sm font-medium ${
                          module.difficulty < 0.33
                            ? 'text-primary'
                            : module.difficulty < 0.66
                            ? 'text-warning'
                            : 'text-danger'
                        }`}
                      >
                        {getDifficultyLabel(module.difficulty)}
                      </span>
                    </div>
                  </div>

                  <DifficultySlider
                    value={module.difficulty}
                    onChange={(value) => setModuleDifficulty(index, value)}
                  />

                  {/* Module-specific hints */}
                  <div className="mt-3 text-xs text-text-dim">
                    {module.type === 'pattern' && (
                      <p>
                        Pattern complexity: {module.difficulty < 0.33 ? '3x3 grid' : module.difficulty < 0.66 ? '4x4 grid' : '5x5 grid'}
                      </p>
                    )}
                    {module.type === 'keypad' && (
                      <p>
                        Code length: {Math.round(4 + module.difficulty * 4)} digits
                        {module.difficulty >= 0.5 && ', shuffled keys'}
                      </p>
                    )}
                    {module.type === 'timing' && (
                      <p>
                        Target zone: {Math.round(90 - module.difficulty * 70)}°,
                        Speed: {Math.round(120 + module.difficulty * 240)}°/s
                      </p>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Tips */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <Card variant="default" padding="md">
          <h3 className="font-display font-semibold text-text mb-2">
            Security Tips
          </h3>
          <ul className="text-sm text-text-dim space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Lower security attracts more attackers but earns more from their failures
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Higher security means fewer attacks but better protection
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Find the sweet spot that matches your risk tolerance
            </li>
          </ul>
        </Card>
      </motion.div>
    </div>
  );
};
