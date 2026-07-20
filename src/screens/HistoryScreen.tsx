import { motion } from 'framer-motion';
import { Swords, Shield, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { StateBadge, StateFrame, type VisualState } from '../components/game';
import { useGameStore } from '../store/gameStore';
import { AttackResult, DefenseEvent } from '../types';

type HistoryItem =
  | { type: 'attack'; data: AttackResult }
  | { type: 'defense'; data: DefenseEvent };

const formatTime = (timestamp: number) => formatDistanceToNow(timestamp, { addSuffix: true });

export const HistoryScreen = () => {
  const { attackHistory, defenseHistory, notifications, markNotificationRead } = useGameStore();

  const allHistory: HistoryItem[] = [
    ...attackHistory.map((a) => ({ type: 'attack' as const, data: a })),
    ...defenseHistory.map((d) => ({ type: 'defense' as const, data: d })),
  ].sort((a, b) => b.data.timestamp - a.data.timestamp);

  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="log-screen">
      <header className="tactical-header">
        <div>
          <p className="eyebrow">OPERATIONS LOG</p>
          <h1>History</h1>
        </div>
        <StateBadge state="secure" label={`${allHistory.length} logged`} compact />
      </header>

      <main>
        {unread.length > 0 && (
          <section aria-label="New events">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">UNREAD</p>
                <h2>New events</h2>
              </div>
            </div>
            <div className="log-list">
              {unread.slice(0, 3).map((n) => {
                const good = n.type.includes('success');
                return (
                  <StateFrame
                    key={n.id}
                    state={good ? 'secure' : 'failed'}
                    className="log-entry log-entry--tap"
                    label={n.title}
                  >
                    <button className="log-entry__body" onClick={() => markNotificationRead(n.id)}>
                      <StateBadge state={good ? 'secure' : 'failed'} label={good ? 'Update' : 'Alert'} compact />
                      <div className="log-entry__copy">
                        <strong>{n.title}</strong>
                        <span>{n.message}</span>
                        <small><Clock size={11} /> {formatTime(n.timestamp)}</small>
                      </div>
                    </button>
                  </StateFrame>
                );
              })}
            </div>
          </section>
        )}

        <section aria-label="Activity log">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Attack &amp; defense log</h2>
            </div>
          </div>

          {allHistory.length === 0 ? (
            <StateFrame state="recovering" className="log-empty" label="No activity yet">
              <strong>No activity yet</strong>
              <span>Enter exposure to start attacking and defending — settled fights land here.</span>
            </StateFrame>
          ) : (
            <div className="log-list">
              {allHistory.map((item, index) => {
                if (item.type === 'attack') {
                  const a = item.data;
                  const state: VisualState = a.success ? 'cracked' : 'failed';
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.03, 0.2) }}>
                      <StateFrame state={state} className="log-entry" label={`Attack on ${a.targetName}`}>
                        <div className="log-entry__body">
                          <Swords size={18} aria-hidden="true" />
                          <div className="log-entry__copy">
                            <div className="log-entry__title">
                              <strong>Attacked {a.targetName}</strong>
                              <StateBadge state={state} label={a.success ? 'Breached' : 'Repelled'} compact />
                            </div>
                            <small><Clock size={11} /> {formatTime(a.timestamp)} · Score {Math.round(a.totalScore * 100)}%</small>
                          </div>
                          <b className={a.success ? 'log-amount log-amount--gain' : 'log-amount log-amount--loss'}>
                            {a.success ? `+${a.lootGained}` : `-${a.stakePaid}`}
                          </b>
                        </div>
                      </StateFrame>
                    </motion.div>
                  );
                }
                const d = item.data;
                const state: VisualState = d.success ? 'secure' : 'breached';
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.03, 0.2) }}>
                    <StateFrame state={state} className="log-entry" label={`Defense against ${d.attackerName}`}>
                      <div className="log-entry__body">
                        <Shield size={18} aria-hidden="true" />
                        <div className="log-entry__copy">
                          <div className="log-entry__title">
                            <strong>Defended from {d.attackerName}</strong>
                            <StateBadge state={state} label={d.success ? 'Held' : 'Breached'} compact />
                          </div>
                          <small><Clock size={11} /> {formatTime(d.timestamp)}</small>
                        </div>
                        <b className={d.success ? 'log-amount log-amount--gain' : 'log-amount log-amount--loss'}>
                          {d.success ? `+${d.feeEarned}` : `-${d.lootLost}`}
                        </b>
                      </div>
                    </StateFrame>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
