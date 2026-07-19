import { Clock3, Coins, Crosshair, LockKeyhole } from 'lucide-react';
import { GameIcon } from './GameIcon';
import { StateBadge } from './VisualState';
import type { ModuleType } from '../../types';

export type RailStatus = 'pending' | 'active' | 'cracked' | 'failed';

export interface BreachRailLock {
  id: string;
  name: string;
  type: ModuleType;
  status: RailStatus;
}

export const BreachHud = ({
  target,
  stake,
  netLoot,
  current,
  total,
  timeLeft,
  progress,
  locks,
}: {
  target: string;
  stake: number;
  netLoot: number;
  current: number;
  total: number;
  timeLeft: number;
  progress: number;
  locks: BreachRailLock[];
}) => (
  <aside className="breach-hud" aria-label="Breach status">
    <div className="breach-hud__intel">
      <span><Crosshair size={13} /> Target<strong>{target}</strong></span>
      <span><LockKeyhole size={13} /> Current<strong>{Math.min(current, total)} / {total}</strong></span>
      <span><Clock3 size={13} /> Remaining<strong>{Math.max(0, timeLeft)}s</strong></span>
    </div>
    <div className="breach-hud__economy">
      <span>Stake at risk <b>-{Math.round(stake).toLocaleString()} TK</b></span>
      <span><Coins size={14} /> Net loot <b>+{Math.round(netLoot).toLocaleString()} TK</b></span>
    </div>
    <div
      className="breach-progress"
      role="progressbar"
      aria-label="Overall breach progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(progress, 100)))}
    >
      <span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
    </div>
    <ol className="breach-rail" aria-label="Lock sequence">
      {locks.map((lock, index) => (
        <li key={lock.id} className={`breach-rail__lock breach-rail__lock--${lock.status}`} aria-label={`Lock ${index + 1}, ${lock.name}, ${lock.status}`}>
          <div className="breach-bolt" aria-hidden="true"><i /><i /></div>
          <GameIcon type={lock.type} size={19} />
          <span>LOCK {index + 1}<strong>{lock.name}</strong></span>
          <StateBadge state={lock.status === 'cracked' ? 'cracked' : lock.status === 'failed' ? 'failed' : lock.status === 'active' ? 'attacking' : 'warning'} label={lock.status} compact />
        </li>
      ))}
    </ol>
  </aside>
);
