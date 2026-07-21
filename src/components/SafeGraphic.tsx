import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Wrench } from 'lucide-react';
import type { SecurityModule } from '../types';
import { GameIcon } from './game';

export type VaultState = 'secure' | 'exposed' | 'attacking' | 'breached' | 'recovering';

interface SafeGraphicProps {
  size?: number;
  state?: VaultState;
  isVulnerable?: boolean;
  isBeingAttacked?: boolean;
  balance?: number;
  locks?: SecurityModule[];
  onLockSelect?: (index: number) => void;
  /** Active insurance draws a temporary hexagonal shield layer around
   *  the vault (a distinct cool tint, separate from the state color). */
  insured?: boolean;
}

const formatBalance = (amount: number): string => {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
};
const STATE_LABELS: Record<VaultState, string> = {
  secure: 'Vault secure',
  exposed: 'Vault exposed to attacks',
  attacking: 'Vault currently under attack',
  breached: 'Vault breached',
  recovering: 'Vault recovering',
};

export const SafeGraphic = ({
  size = 320,
  state: explicitState,
  isVulnerable = false,
  isBeingAttacked = false,
  balance,
  locks = [],
  onLockSelect,
  insured = false,
}: SafeGraphicProps) => {
  const reduceMotion = useReducedMotion();
  const state: VaultState = explicitState ?? (isBeingAttacked ? 'attacking' : isVulnerable ? 'exposed' : 'secure');
  const secure = state === 'secure';
  const breached = state === 'breached';
  const stateColor = secure ? '#D8FF45' : state === 'recovering' || state === 'exposed' ? '#FFAE42' : '#FF5B32';
  const dialMotion = reduceMotion || secure || breached ? 0 : state === 'attacking' ? 360 : 90;

  return (
    <div
      className={`tactical-vault-block${insured ? ' tactical-vault-block--insured' : ''}`}
      style={{ '--vault-size': `${size}px`, '--vault-state': stateColor } as React.CSSProperties}
    >
    <figure
      className={`tactical-vault tactical-vault--${state}${insured ? ' tactical-vault--insured' : ''}`}
      role="group"
      aria-label={`${STATE_LABELS[state]}${insured ? ', insured' : ''}${balance === undefined ? '' : ` with ${balance.toLocaleString()} tokens`}`}
    >
      <motion.div
        className="tactical-vault__assembly"
        animate={reduceMotion || state !== 'attacking' ? undefined : { x: [0, -3, 3, -2, 0] }}
        transition={{ duration: 0.38, repeat: Infinity, repeatDelay: 1.8 }}
      >
        <svg viewBox="0 0 320 320" className="tactical-vault__svg" aria-hidden="true">
          <defs>
            <radialGradient id="door-metal" cx="42%" cy="35%" r="70%">
              <stop offset="0" stopColor="#303630" />
              <stop offset="0.55" stopColor="#171b17" />
              <stop offset="1" stopColor="#0a0c0a" />
            </radialGradient>
            <linearGradient id="frame-metal" x1="0" x2="1" y1="0" y2="1">
              <stop stopColor="#3b423b" />
              <stop offset="0.34" stopColor="#111511" />
              <stop offset="0.7" stopColor="#252b25" />
              <stop offset="1" stopColor="#080a08" />
            </linearGradient>
            <filter id="state-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <path d="M48 20h224l28 28v224l-28 28H48l-28-28V48z" fill="#050705" stroke="#2d332d" strokeWidth="4" />
          <path d="M54 29h212l24 24v212l-24 24H54l-24-24V53z" fill="url(#frame-metal)" stroke={stateColor} strokeOpacity=".45" strokeWidth="2" />
          <path d="M67 46h186l20 20v188l-20 20H67l-20-20V66z" fill="#090b09" stroke="#424942" />

          {insured && (
            <g className="tactical-vault__shield" aria-hidden="true">
              <motion.path
                d="M160 14 L34 87 L34 233 L160 306 L286 233 L286 87 Z"
                fill="none"
                stroke="#7fe3ff"
                strokeWidth="2.5"
                strokeDasharray="7 8"
                strokeLinejoin="round"
                animate={reduceMotion ? { opacity: 0.55 } : { opacity: [0.3, 0.78, 0.3] }}
                transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              {[[160, 14], [34, 87], [286, 87], [34, 233], [286, 233], [160, 306]].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#7fe3ff" opacity="0.7" />
              ))}
            </g>
          )}

          {[{x: 45,y:45},{x:275,y:45},{x:45,y:275},{x:275,y:275}].map((bolt, index) => (
            <g key={index} className={breached && index === 1 ? 'tactical-vault__bolt--displaced' : ''}>
              <circle cx={bolt.x} cy={bolt.y} r="7" fill="#272d27" stroke="#5a635a" />
              <path d={`M${bolt.x - 3} ${bolt.y}h6`} stroke="#090b09" strokeWidth="2" />
            </g>
          ))}

          <motion.g
            className="tactical-vault__door"
            initial={{ x: 0, rotateY: 0, opacity: 1 }}
            animate={breached && !reduceMotion
              ? { x: 48, rotateY: 24, opacity: 0.68 }
              : { x: 0, rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 90 }}
          >
            <circle cx="160" cy="160" r="104" fill="url(#door-metal)" stroke="#4b534b" strokeWidth="5" />
            <circle cx="160" cy="160" r="89" fill="none" stroke={stateColor} strokeOpacity=".38" strokeWidth="2" strokeDasharray={breached ? '24 14' : '3 8'} />
            <circle cx="160" cy="160" r="72" fill="#101310" stroke="#323832" strokeWidth="8" />

            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <motion.rect
                key={angle}
                x="153"
                y="52"
                width="14"
                height="36"
                rx="3"
                fill="#596159"
                stroke="#0a0c0a"
                style={{ transformOrigin: '160px 160px', rotate: `${angle}deg` }}
                animate={breached && !reduceMotion ? { y: -16 } : undefined}
              />
            ))}

            <motion.g
              style={{ transformOrigin: '160px 160px' }}
              animate={dialMotion ? { rotate: dialMotion } : undefined}
              transition={{ duration: state === 'attacking' ? 1.2 : 3, repeat: state === 'attacking' ? Infinity : 0, ease: 'linear' }}
            >
              <circle cx="160" cy="160" r="50" fill="#080a08" stroke={stateColor} strokeWidth="3" />
              <circle cx="160" cy="160" r="33" fill="#242a24" stroke="#5c655c" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <line key={angle} x1="160" y1="119" x2="160" y2="127" stroke={stateColor} strokeWidth="2" style={{ transformOrigin: '160px 160px', rotate: `${angle}deg` }} />
              ))}
              <path d="M160 160V130" stroke={stateColor} strokeWidth="5" strokeLinecap="round" />
            </motion.g>
            <circle cx="160" cy="160" r="10" fill={stateColor} filter="url(#state-glow)" />
          </motion.g>

          {!secure && (
            <motion.path
              d="M76 76L244 244"
              stroke={stateColor}
              strokeWidth="2"
              strokeDasharray="8 10"
              animate={reduceMotion ? undefined : { pathLength: [0.12, 1], opacity: [0.15, 0.85, 0.15] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          {breached && <path d="M211 57l-17 39 21 20-24 37 18 25" fill="none" stroke="#fff" strokeWidth="3" />}
        </svg>

        {state === 'exposed' && <AlertTriangle className="tactical-vault__state-mark" aria-hidden="true" />}
        {state === 'secure' && <ShieldCheck className="tactical-vault__state-mark" aria-hidden="true" />}
        {state === 'recovering' && <Wrench className="tactical-vault__state-mark" aria-hidden="true" />}

        {locks.slice(0, 3).map((lock, index) => (
          <button
            key={lock.id}
            type="button"
            className={`tactical-vault__lock tactical-vault__lock--${index + 1}`}
            onClick={() => onLockSelect?.(index)}
            aria-label={`Lock ${index + 1}: ${lock.name}, ${Math.round(lock.difficulty * 100)} percent difficulty`}
          >
            <GameIcon type={lock.type} size={20} />
            <span>{index + 1}</span>
          </button>
        ))}
      </motion.div>
      <figcaption className="sr-only">{STATE_LABELS[state]}</figcaption>
    </figure>

    {balance !== undefined && (
      <div className="tactical-vault__readout" aria-hidden="true">
        <span>{state === 'secure' ? 'SECURED BALANCE' : 'VAULT BALANCE'}</span>
        <strong>{formatBalance(balance)} <small>TK</small></strong>
      </div>
    )}
    </div>
  );
};

export const TargetSafeGraphic = ({
  size = 80,
  difficulty = 'tricky',
}: {
  size?: number;
  difficulty?: 'soft' | 'tricky' | 'brutal';
  ownerName?: string;
}) => {
  const colors = { soft: '#D8FF45', tricky: '#FFAE42', brutal: '#FF5B32' };
  const color = colors[difficulty];
  return (
    <div className="target-vault-emblem" style={{ width: size, height: size, color }} aria-hidden="true">
      <svg viewBox="0 0 80 80" width={size} height={size}>
        <path d="M12 7h49l12 12v48l-7 7H12L6 68V14z" fill="#111411" stroke="currentColor" strokeWidth="2" />
        <circle cx="39" cy="40" r="20" fill="#090b09" stroke="currentColor" strokeDasharray="3 4" />
        <circle cx="39" cy="40" r="9" fill="#202520" stroke="currentColor" />
        <path d="M39 40V31M39 40l8 5" stroke="currentColor" strokeWidth="2" />
        <path d="M66 30v20" stroke="currentColor" strokeWidth="4" />
      </svg>
    </div>
  );
};
