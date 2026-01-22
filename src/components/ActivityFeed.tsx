// Activity Feed Component - Robinhood-style transaction list
// Clean, minimal design with profit/loss indicators

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Target, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { formatDistanceToNow } from 'date-fns';
import { haptics } from '../utils/haptics';

interface ActivityItem {
  id: string;
  type: 'defense_success' | 'defense_fail' | 'attack_success' | 'attack_fail' | 'insurance';
  title: string;
  subtitle: string;
  amount: number;
  timestamp: number;
}

const getIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'attack_success':
      return <Target size={18} />;
    case 'attack_fail':
      return <Target size={18} />;
    case 'defense_success':
      return <Shield size={18} />;
    case 'defense_fail':
      return <AlertTriangle size={18} />;
    case 'insurance':
      return <Shield size={18} />;
    default:
      return <TrendingUp size={18} />;
  }
};

const isPositive = (type: ActivityItem['type']) => {
  return type === 'attack_success' || type === 'defense_success' || type === 'insurance';
};

// Empty state icon - line drawing style
const EmptyActivityIcon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    className="mx-auto mb-4 opacity-40"
  >
    <rect x="8" y="12" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
    <line x1="8" y1="24" x2="56" y2="24" stroke="currentColor" strokeWidth="2" />
    <line x1="16" y1="32" x2="40" y2="32" stroke="currentColor" strokeWidth="2" strokeOpacity="0.5" />
    <line x1="16" y1="40" x2="36" y2="40" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
    <line x1="16" y1="48" x2="32" y2="48" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
  </svg>
);

const ActivityFeedItem = memo(({
  item,
  index,
}: {
  item: ActivityItem;
  index: number;
}) => {
  const positive = isPositive(item.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.03 }}
      className="activity-item"
      onClick={() => haptics.light()}
    >
      <div className={`activity-icon ${positive ? 'profit' : 'loss'}`}>
        {getIcon(item.type)}
      </div>

      <div className="activity-content">
        <div className="activity-title">{item.title}</div>
        <div className="activity-subtitle">
          {item.subtitle} · {formatDistanceToNow(item.timestamp, { addSuffix: true })}
        </div>
      </div>

      <div className={`activity-amount ${positive ? 'profit' : 'loss'}`}>
        {item.amount >= 0 ? '+' : ''}{item.amount.toLocaleString()}
      </div>
    </motion.div>
  );
});

ActivityFeedItem.displayName = 'ActivityFeedItem';

export const ActivityFeed = memo(() => {
  const { attackHistory, defenseHistory } = useGameStore();

  // Combine and sort activity
  const attackItems: ActivityItem[] = attackHistory.map((attack) => ({
    id: attack.id,
    type: (attack.success ? 'attack_success' : 'attack_fail') as ActivityItem['type'],
    title: attack.success ? 'Heist successful' : 'Heist failed',
    subtitle: attack.targetName,
    amount: attack.success ? attack.lootGained : -attack.stakePaid,
    timestamp: attack.timestamp,
  }));

  const defenseItems: ActivityItem[] = defenseHistory.map((defense) => ({
    id: defense.id,
    type: (defense.success ? 'defense_fail' : 'defense_success') as ActivityItem['type'],
    title: defense.success ? 'Safe breached' : 'Defended attack',
    subtitle: `by ${defense.attackerName}`,
    amount: defense.success ? -(defense.lootLost - defense.insurancePayout) : defense.feeEarned,
    timestamp: defense.timestamp,
  }));

  const activity = [...attackItems, ...defenseItems]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  if (activity.length === 0) {
    return (
      <div className="activity-feed">
        <div className="py-10 text-center">
          <EmptyActivityIcon />
          <p className="text-text font-medium text-base mb-1">No activity yet</p>
          <p className="text-text-dim text-sm">
            Start a heist to earn tokens
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      <AnimatePresence mode="popLayout">
        {activity.map((item, index) => (
          <ActivityFeedItem key={item.id} item={item} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
});

ActivityFeed.displayName = 'ActivityFeed';

export default ActivityFeed;
