// Live "someone is raiding you" banner.
//
// Shown only while exposed and only when a REAL attack row exists
// against this safe — it can never appear for a fabricated raid,
// because the only source is the attacks table.
//
// PRESENTATION ONLY. Settlement happens in submit_result; this banner
// could be deleted without changing a single token movement.
//
// Placement: a slim bar pinned above the bottom nav. Deliberately not a
// modal and not full-width-centre — it must not obscure the target list
// or block the attack flow while the player is mid-raid themselves.

import { AlertTriangle } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import type { InFlightAttack } from '../services/api';

/** "1m 20s" / "14s" — elapsed, which is the only honest progress
 *  signal available (see resolve_defense). */
const formatElapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${seconds % 60}s`;
};

export const UnderAttackAlert = ({ attacks }: { attacks: InFlightAttack[] }) => {
  const reduceMotion = useReducedMotion();
  if (attacks.length === 0) return null;

  const [first] = attacks;
  const more = attacks.length - 1;

  return (
    <div
      className={`under-attack-alert${reduceMotion ? '' : ' under-attack-alert--pulse'}`}
      role="status"
      aria-live="polite"
      aria-label={
        attacks.length === 1
          ? `${first.attackerHandle} is cracking your vault`
          : `${attacks.length} raiders are cracking your vault`
      }
    >
      <AlertTriangle size={17} aria-hidden="true" />
      <span className="under-attack-alert__body">
        <strong>
          {attacks.length === 1
            ? `${first.attackerHandle} is cracking your vault`
            : `${attacks.length} raiders are cracking your vault`}
        </strong>
        <small>
          {formatElapsed(first.elapsedSeconds)} in
          {first.lockCount > 0 ? ` · ${first.lockCount} locks holding` : ''}
          {more > 0 ? ` · +${more} more` : ''}
        </small>
      </span>
    </div>
  );
};
