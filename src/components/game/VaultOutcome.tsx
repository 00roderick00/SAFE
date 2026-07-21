import { AlertTriangle, Coins, DoorOpen, LockKeyhole } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { StateBadge } from './VisualState';

export const VaultOutcome = ({
  success,
  target,
  stake,
  grossLoot,
  platformFee,
  netLoot,
  abandoned = false,
}: {
  success: boolean;
  target: string;
  stake: number;
  grossLoot: number;
  platformFee: number;
  netLoot: number;
  /** True when the run was abandoned mid-attack rather than played out;
   *  changes the loss copy so the forfeited stake is explained. */
  abandoned?: boolean;
}) => {
  const reducedMotion = useReducedMotion();
  return (
    <div className={`vault-outcome vault-outcome--${success ? 'breached' : 'sealed'}`}>
      <div className={`outcome-vault${success ? ' outcome-vault--open' : ''}`} aria-hidden="true">
        <div className="outcome-vault__frame" />
        {/* Interior token chamber, revealed as the door swings open. */}
        {success && (
          <div className="outcome-vault__chamber">
            {[0, 1, 2, 3].map((i) => <span key={i} className="chamber-coin" style={{ '--i': i } as React.CSSProperties} />)}
          </div>
        )}
        <motion.div
          className="outcome-vault__door"
          initial={false}
          animate={reducedMotion ? (success ? { x: 58, rotate: 12 } : undefined) : success ? { x: 58, rotate: 12 } : { scale: [1.06, .96, 1], x: [0, -5, 4, 0] }}
          transition={{ duration: .72, type: 'spring', damping: 16 }}
        >
          <i /><b />
        </motion.div>
        {/* Loot visibly transfers out of the target vault toward the attacker. */}
        {success && !reducedMotion && (
          <div className="outcome-loot-stream">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="loot-coin"
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], x: [0, 6, 30, 62], y: [0, -26, -58, -96], scale: [0.6, 1, 1, 0.7] }}
                transition={{ duration: 1.1, delay: 0.5 + i * 0.14, ease: 'easeOut' }}
              />
            ))}
          </div>
        )}
        {success ? <DoorOpen className="outcome-vault__mark" /> : <LockKeyhole className="outcome-vault__mark" />}
      </div>
      <StateBadge state={success ? 'breached' : 'failed'} label={success ? 'Full breach' : abandoned ? 'Attack abandoned' : 'Vault sealed'} />
      <h2>{success ? `You won ${Math.round(netLoot).toLocaleString()} TK` : `You lost ${Math.round(stake).toLocaleString()} TK`}</h2>
      <p className="outcome-subhead">{success ? `You cracked all three locks on ${target}.` : abandoned ? 'You backed out after committing the stake.' : `A lock on ${target} held.`}</p>
      {success ? (
        <div className="outcome-reward"><Coins size={24} /><span>NET LOOT RECEIVED</span><strong>+{Math.round(netLoot).toLocaleString()} TK</strong></div>
      ) : (
        <div className="outcome-loss"><AlertTriangle size={24} /><span>{abandoned ? 'STAKE FORFEITED' : 'STAKE DEDUCTED'}</span><strong>-{Math.round(stake).toLocaleString()} TK</strong><small>{abandoned ? 'You backed out — the committed stake is forfeited.' : 'One lock held. Every lock is required for a payout.'}</small></div>
      )}
      {success && (
        <dl className="outcome-settlement">
          <div><dt>Gross loot</dt><dd>{Math.round(grossLoot).toLocaleString()} TK</dd></div>
          <div><dt>Platform cut</dt><dd>-{Math.round(platformFee).toLocaleString()} TK</dd></div>
          <div><dt>Final net payout</dt><dd>+{Math.round(netLoot).toLocaleString()} TK</dd></div>
        </dl>
      )}
    </div>
  );
};
