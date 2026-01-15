import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Shield, ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Card, CardHeader, DifficultySlider, CircularProgress, Button } from '../components/ui';
import { CustomGameSuggest } from '../components/CustomGameSuggest';
import { usePlayerStore } from '../store/playerStore';
import { calculateEconomyStats } from '../game/economy';
import { MODULE_CONFIG, MODULE_CATEGORIES } from '../game/constants';
import { getModulesByCategory } from '../game/modules';
import { ModuleType, CustomGameSuggestion } from '../types';

export const SecurityScreen = () => {
  const { securityLoadout, setModuleDifficulty, setModuleType, safeBalance } = usePlayerStore();
  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [customSuggestions, setCustomSuggestions] = useState<CustomGameSuggestion[]>([]);

  const modulesByCategory = getModulesByCategory();

  const getDifficultyLabel = (value: number): string => {
    if (value < 0.33) return 'Easy';
    if (value < 0.66) return 'Medium';
    return 'Hard';
  };

  const getModuleIcon = (type: string): string => {
    const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG];
    return config?.icon || '🎮';
  };

  const handleModuleChange = (slotIndex: number, newType: ModuleType) => {
    setModuleType(slotIndex, newType);
    setExpandedSlot(null);
  };

  const handleCustomSuggestion = (suggestion: CustomGameSuggestion) => {
    setCustomSuggestions([...customSuggestions, suggestion]);
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
          Choose games and set difficulty for each security slot. Tap the game to change it.
        </p>

        <div className="space-y-4">
          {securityLoadout.modules.map((module, index) => {
            const isExpanded = expandedSlot === index;

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
              >
                <Card variant="default" padding="md">
                  {/* Module Header - Click to expand */}
                  <button
                    className="w-full flex items-start gap-3 mb-4"
                    onClick={() => setExpandedSlot(isExpanded ? null : index)}
                  >
                    <div className="p-2 bg-primary/10 rounded-lg text-2xl">
                      {getModuleIcon(module.type)}
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-display font-semibold text-text">
                        {module.name}
                      </h3>
                      <p className="text-sm text-text-dim">
                        {module.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
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
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-text-dim mt-1" />
                      ) : (
                        <ChevronDown size={16} className="text-text-dim mt-1" />
                      )}
                    </div>
                  </button>

                  {/* Difficulty Slider */}
                  <DifficultySlider
                    value={module.difficulty}
                    onChange={(value) => setModuleDifficulty(index, value)}
                  />

                  {/* Game Selection Panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-primary/10">
                          <div className="flex items-center gap-2 mb-3">
                            <Shuffle size={16} className="text-primary" />
                            <span className="text-sm font-medium text-text">
                              Change Security Game
                            </span>
                          </div>

                          {/* Categories */}
                          {Object.entries(MODULE_CATEGORIES).map(([catKey, catInfo]) => {
                            const games = modulesByCategory[catKey as keyof typeof modulesByCategory];
                            if (!games || games.length === 0) return null;

                            return (
                              <div key={catKey} className="mb-4">
                                <h4 className="text-xs text-text-dim uppercase tracking-wider mb-2">
                                  {catInfo.name}
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                  {games.map((game) => (
                                    <button
                                      key={game.type}
                                      className={`p-2 rounded-lg border text-center transition-colors ${
                                        module.type === game.type
                                          ? 'bg-primary/20 border-primary'
                                          : 'bg-surface border-primary/20 hover:border-primary/50'
                                      }`}
                                      onClick={() => handleModuleChange(index, game.type as ModuleType)}
                                    >
                                      <span className="text-xl block mb-1">{game.icon}</span>
                                      <span className="text-xs text-text truncate block">
                                        {game.name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}

                          {/* Custom Suggestions */}
                          {customSuggestions.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-xs text-text-dim uppercase tracking-wider mb-2">
                                Your Custom Games
                              </h4>
                              <div className="grid grid-cols-3 gap-2">
                                {customSuggestions
                                  .filter((s) => s.status === 'approved' || s.status === 'built')
                                  .map((suggestion) => (
                                    <button
                                      key={suggestion.id}
                                      className="p-2 rounded-lg border bg-surface border-accent/20 hover:border-accent/50 text-center transition-colors"
                                      onClick={() => {
                                        // Custom games would be handled specially
                                      }}
                                    >
                                      <span className="text-xl block mb-1">🎮</span>
                                      <span className="text-xs text-text truncate block">
                                        {suggestion.name}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Custom Game Suggestion */}
        <CustomGameSuggest onSuggestionSubmit={handleCustomSuggestion} />
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
              Arcade games are harder to beat but more engaging for attackers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Mix different game types to catch attackers off-guard
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Create custom games for unique, unpredictable security
            </li>
          </ul>
        </Card>
      </motion.div>
    </div>
  );
};
