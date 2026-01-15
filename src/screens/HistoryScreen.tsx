import { motion } from 'framer-motion';
import {
  Swords,
  Shield,
  CheckCircle,
  XCircle,
  Coins,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageHeader } from '../components/Layout';
import { Card } from '../components/ui';
import { useGameStore } from '../store/gameStore';
import { AttackResult, DefenseEvent } from '../types';

type HistoryItem =
  | { type: 'attack'; data: AttackResult }
  | { type: 'defense'; data: DefenseEvent };

export const HistoryScreen = () => {
  const { attackHistory, defenseHistory, notifications, markNotificationRead } =
    useGameStore();

  // Combine and sort by timestamp
  const allHistory: HistoryItem[] = [
    ...attackHistory.map((a) => ({ type: 'attack' as const, data: a })),
    ...defenseHistory.map((d) => ({ type: 'defense' as const, data: d })),
  ].sort((a, b) => b.data.timestamp - a.data.timestamp);

  const formatTime = (timestamp: number) => {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  return (
    <div className="px-4 pb-8">
      <PageHeader
        title="History"
        subtitle="Your attack and defense logs"
      />

      {/* Unread Notifications */}
      {notifications.filter((n) => !n.read).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="font-display text-sm font-semibold text-text-dim mb-2 uppercase tracking-wider">
            New Events
          </h2>
          <div className="space-y-2">
            {notifications
              .filter((n) => !n.read)
              .slice(0, 3)
              .map((notification) => (
                <Card
                  key={notification.id}
                  variant="elevated"
                  padding="sm"
                  className="border-l-4 border-l-primary"
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        notification.type.includes('success')
                          ? 'bg-primary/10'
                          : 'bg-danger/10'
                      }`}
                    >
                      {notification.type.includes('success') ? (
                        <CheckCircle
                          size={18}
                          className="text-primary"
                        />
                      ) : (
                        <XCircle size={18} className="text-danger" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text text-sm">
                        {notification.title}
                      </p>
                      <p className="text-xs text-text-dim mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-text-dim/50 mt-1">
                        {formatTime(notification.timestamp)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </motion.div>
      )}

      {/* History List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="font-display text-sm font-semibold text-text-dim mb-3 uppercase tracking-wider">
          Activity Log
        </h2>

        {allHistory.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <p className="text-text-dim">No activity yet</p>
            <p className="text-sm text-text-dim/50 mt-1">
              Enter Heist Mode to start attacking and defending
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {allHistory.map((item, index) => {
              if (item.type === 'attack') {
                const attack = item.data;
                return (
                  <motion.div
                    key={attack.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card variant="default" padding="sm">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            attack.success
                              ? 'bg-primary/10'
                              : 'bg-danger/10'
                          }`}
                        >
                          <Swords
                            size={20}
                            className={
                              attack.success
                                ? 'text-primary'
                                : 'text-danger'
                            }
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text text-sm">
                              Attacked {attack.targetName}
                            </span>
                            {attack.success ? (
                              <CheckCircle
                                size={14}
                                className="text-primary"
                              />
                            ) : (
                              <XCircle
                                size={14}
                                className="text-danger"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-text-dim">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatTime(attack.timestamp)}
                            </span>
                            <span>
                              Score: {Math.round(attack.totalScore * 100)}%
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          {attack.success ? (
                            <span className="font-display font-bold text-primary">
                              +{attack.lootGained}
                            </span>
                          ) : (
                            <span className="font-display font-bold text-danger">
                              -{attack.stakePaid}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              } else {
                const defense = item.data;
                return (
                  <motion.div
                    key={defense.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card variant="default" padding="sm">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            defense.success
                              ? 'bg-primary/10'
                              : 'bg-danger/10'
                          }`}
                        >
                          <Shield
                            size={20}
                            className={
                              defense.success
                                ? 'text-primary'
                                : 'text-danger'
                            }
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text text-sm">
                              Defended from {defense.attackerName}
                            </span>
                            {defense.success ? (
                              <CheckCircle
                                size={14}
                                className="text-primary"
                              />
                            ) : (
                              <XCircle
                                size={14}
                                className="text-danger"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-text-dim">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatTime(defense.timestamp)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          {defense.success ? (
                            <span className="font-display font-bold text-primary">
                              +{defense.feeEarned}
                            </span>
                          ) : (
                            <span className="font-display font-bold text-danger">
                              -{defense.lootLost}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              }
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};
