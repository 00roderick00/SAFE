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
      <div className="outcome-vault" aria-hidden="true">
        <div className="outcome-vault__frame" />
        <motion.div
          className="outcome-vault__door"
          initial={false}
          animate={reducedMotion ? undefined : success ? { x: 58, rotate: 12 } : { scale: [1.06, .96, 1], x: [0, -5, 4, 0] }}
          transition={{ duration: .72, type: 'spring', damping: 16 }}
        >
          <i /><b />
        </motion.div>
        {success ? <DoorOpen className="outcome-vault__mark" /> : <LockKeyhole className="outcome-vault__mark" />}
      </div>
      <StateBadge state={success ? 'breached' : 'failed'} label={success ? 'Full breach' : abandoned ? 'Attack abandoned' : 'Vault sealed'} />
      <h2>{success ? `${target} breached` : abandoned ? 'Attack abandoned' : 'Heist terminated'}</h2>
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
