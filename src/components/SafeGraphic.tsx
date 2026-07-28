import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Wrench } from 'lucide-react';
import type { SecurityModule } from '../types';
import { GameIcon } from './game';

// ---------------------------------------------------------------------
// Material pass (docs/vault-reference/*.jpg)
//
// Everything below is static geometry: layered gradients, gradient-
// stroked rings and fine concentric strokes. Deliberately NO
// feTurbulence / feSpecularLighting — both are per-pixel filters that
// cost real frames on phones, and the same read is achievable with
// vector primitives the GPU composites for free. The only filter in the
// component is the pre-existing #state-glow on the small hub.
//
// Brushed grain: GRAIN_RINGS concentric hairlines at alternating low
// opacity. A deterministic pattern (no Math.random) so the render is
// stable across SSR/tests/re-renders.
// ---------------------------------------------------------------------

/** Concentric hairlines that read as circular brushed grain. */
const GRAIN_RINGS = Array.from({ length: 22 }, (_, i) => {
  const r = 14 + i * 4.0;
  // Alternating weight + a slow beat so the grain doesn't look banded.
  const strong = i % 3 === 0;
  const beat = ((i * 7) % 5) / 5;
  return { r, opacity: (strong ? 0.13 : 0.06) + beat * 0.03, width: strong ? 0.8 : 0.55 };
});

/** Finer grain for the dial face. */
const DIAL_GRAIN = Array.from({ length: 7 }, (_, i) => ({
  r: 20 + i * 2.6,
  opacity: i % 2 === 0 ? 0.06 : 0.03,
}));

/** Classic vault-dial numerals, oriented radially like the reference. */
const DIAL_NUMERALS = Array.from({ length: 10 }, (_, i) => ({ value: i * 10, angle: i * 36 }));

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

  // Gradient ids are namespaced per instance: several vaults can be on
  // screen in different states, and duplicate ids would make the first
  // instance's state tint win for all of them.
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

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
            {/* Door face: cool blue-steel, lit from upper-left, falling
                to a deep shadow bottom-right (reference frames 1–2). */}
            <linearGradient id={id('door-metal')} x1="0.12" y1="0.02" x2="0.88" y2="1">
              <stop offset="0" stopColor="#b3cadb" />
              <stop offset="0.16" stopColor="#7d94a6" />
              <stop offset="0.38" stopColor="#4a6375" />
              <stop offset="0.66" stopColor="#243646" />
              <stop offset="1" stopColor="#0a1622" />
            </linearGradient>
            {/* Vignette that darkens the rim so the face reads domed. */}
            <radialGradient id={id('door-vignette')} cx="50%" cy="50%" r="50%">
              <stop offset="0.7" stopColor="#000000" stopOpacity="0" />
              <stop offset="0.92" stopColor="#000814" stopOpacity="0.22" />
              <stop offset="1" stopColor="#000814" stopOpacity="0.5" />
            </radialGradient>
            {/* Bevel stroke: light on the top-left edge, dark on the
                bottom-right, which is what makes a ring read as having
                real thickness. Reused on every concentric ring. */}
            <linearGradient id={id('bevel')} x1="0.15" y1="0" x2="0.85" y2="1">
              <stop offset="0" stopColor="#cfe2ef" />
              <stop offset="0.35" stopColor="#7d95a5" />
              <stop offset="0.62" stopColor="#243646" />
              <stop offset="1" stopColor="#07111e" />
            </linearGradient>
            {/* Inverted bevel for inner walls (light comes off the far
                side of a recess). */}
            <linearGradient id={id('bevel-inv')} x1="0.15" y1="0" x2="0.85" y2="1">
              <stop offset="0" stopColor="#07111e" />
              <stop offset="0.4" stopColor="#1b2d3e" />
              <stop offset="0.75" stopColor="#8aa1b1" />
              <stop offset="1" stopColor="#c4d8e6" />
            </linearGradient>
            {/* Broad directional specular sweep across the upper-left. */}
            <linearGradient id={id('spec')} x1="0.05" y1="0" x2="0.75" y2="1">
              <stop offset="0.02" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.16" stopColor="#f2fbff" stopOpacity="0.46" />
              <stop offset="0.27" stopColor="#dcecf8" stopOpacity="0.16" />
              <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* Weaker secondary sweep low-left, as in reference frame 2. */}
            <linearGradient id={id('spec2')} x1="0" y1="1" x2="1" y2="0.2">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.3" stopColor="#cfe4f2" stopOpacity="0.13" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* State tint: strongest around the rim so the material
                takes the colour rather than just outlining it. */}
            <radialGradient id={id('door-tint')} cx="42%" cy="34%" r="72%">
              <stop offset="0.25" stopColor={stateColor} stopOpacity="0.03" />
              <stop offset="0.72" stopColor={stateColor} stopOpacity="0.10" />
              <stop offset="1" stopColor={stateColor} stopOpacity="0.22" />
            </radialGradient>
            {/* Soft contact shadow where the door sits proud of the frame. */}
            <radialGradient id={id('contact')} cx="50%" cy="50%" r="50%">
              <stop offset="0.72" stopColor="#000000" stopOpacity="0.55" />
              <stop offset="0.88" stopColor="#000000" stopOpacity="0.28" />
              <stop offset="1" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            {/* Frame: same steel family, flatter and darker than the door. */}
            <linearGradient id={id('frame-metal')} x1="0" x2="1" y1="0" y2="1">
              <stop stopColor="#54697a" />
              <stop offset="0.32" stopColor="#15222f" />
              <stop offset="0.68" stopColor="#31414c" />
              <stop offset="1" stopColor="#06101c" />
            </linearGradient>
            {/* Bolt barrel: across-axis cylinder shading. */}
            <linearGradient id={id('bolt-barrel')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0d1b28" />
              <stop offset="0.18" stopColor="#41586c" />
              <stop offset="0.38" stopColor="#b9d0e2" />
              <stop offset="0.55" stopColor="#7089a0" />
              <stop offset="0.8" stopColor="#2a3d50" />
              <stop offset="1" stopColor="#0a1420" />
            </linearGradient>
            {/* Bolt end cap / collar: brighter, same across-axis ramp. */}
            <linearGradient id={id('bolt-cap')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1b2c3c" />
              <stop offset="0.35" stopColor="#cfe2f2" />
              <stop offset="0.62" stopColor="#8ba3b8" />
              <stop offset="1" stopColor="#16283a" />
            </linearGradient>
            {/* Breach: the dark interior revealed behind the sprung door. */}
            <linearGradient id={id('breach-gap')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#01050a" stopOpacity="0.95" />
              <stop offset="0.7" stopColor="#02080f" stopOpacity="0.75" />
              <stop offset="1" stopColor="#04101c" stopOpacity="0" />
            </linearGradient>

            {/* Polished hub cone: bright sweep converging at centre. */}
            <radialGradient id={id('hub')} cx="38%" cy="30%" r="72%">
              <stop offset="0" stopColor="#e8f4fc" />
              <stop offset="0.45" stopColor="#8fa9ba" />
              <stop offset="1" stopColor="#233648" />
            </radialGradient>
            <radialGradient id={id('dial-face')} cx="40%" cy="32%" r="75%">
              <stop offset="0" stopColor="#5e7482" />
              <stop offset="0.5" stopColor="#2e4250" />
              <stop offset="1" stopColor="#122130" />
            </radialGradient>
            {/* Clips the sweeps to the door face so they never spill. */}
            <clipPath id={id('door-clip')}>
              <circle cx="160" cy="160" r="96" />
            </clipPath>
            <clipPath id={id('dial-clip')}>
              <circle cx="160" cy="160" r="44" />
            </clipPath>
            <filter id={id('state-glow')} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <path d="M48 20h224l28 28v224l-28 28H48l-28-28V48z" fill="#040b12" stroke="#2d4353" strokeWidth="4" />
          <path d="M54 29h212l24 24v212l-24 24H54l-24-24V53z" fill={url('frame-metal')} stroke={stateColor} strokeOpacity=".45" strokeWidth="2" />
          {/* Bevelled inner lip of the frame opening. */}
          <path d="M67 46h186l20 20v188l-20 20H67l-20-20V66z" fill="#06101c" stroke={url('bevel-inv')} strokeWidth="2.5" />
          <path d="M71 50h178l17 17v182l-17 17H71l-17-17V67z" fill="none" stroke="#000" strokeOpacity=".55" strokeWidth="2" />

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
              <circle cx={bolt.x} cy={bolt.y} r="7" fill={url('hub')} stroke={url('bevel')} strokeWidth="1.6" />
              <path d={`M${bolt.x - 3} ${bolt.y}h6`} stroke="#070d12" strokeWidth="2" />
            </g>
          ))}

          {/* Breach reads through material, not a drawn crack: the door
              has sprung, so the shadowed interior shows along its hinge
              side and the door's own edge falls into shadow. */}
          {breached && (
            <g aria-hidden="true">
              <path d="M67 46h186l20 20v188l-20 20H67l-20-20V66z" fill="#02070d" />
              <rect x="47" y="46" width="120" height="248" fill={url('breach-gap')} />
            </g>
          )}

          <motion.g
            className="tactical-vault__door"
            initial={{ x: 0, rotateY: 0, opacity: 1 }}
            animate={breached && !reduceMotion
              ? { x: 48, rotateY: 24, opacity: 0.68 }
              : { x: 0, rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 90 }}
          >
            {/* Contact shadow: the door sits proud of the frame, so it
                casts down-right away from the key light. */}
            <circle cx="164" cy="167" r="112" fill={url('contact')} />

            {/* Outer rim: a thick gradient-stroked ring reads as a
                machined bevel (light top-left, dark bottom-right). */}
            <circle cx="160" cy="160" r="104" fill={url('door-metal')} stroke={url('bevel')} strokeWidth="6" />
            <circle cx="160" cy="160" r="100" fill="none" stroke="#0a1218" strokeOpacity=".7" strokeWidth="1.5" />

            {/* Door face + circular brushed grain, clipped to the face. */}
            <circle cx="160" cy="160" r="96" fill={url('door-metal')} />
            <g clipPath={`url(#${id('door-clip')})`}>
              <g aria-hidden="true">
                {GRAIN_RINGS.map((ring) => (
                  <circle
                    key={ring.r}
                    cx="160"
                    cy="160"
                    r={ring.r}
                    fill="none"
                    stroke="#dceaf5"
                    strokeOpacity={ring.opacity}
                    strokeWidth={ring.width}
                  />
                ))}
              </g>
              {/* Directional speculars, angled across the upper-left. */}
              <rect x="40" y="40" width="240" height="240" fill={url('spec')} />
              <rect x="40" y="40" width="240" height="240" fill={url('spec2')} />
              {/* State tint sits over the grain so the metal itself
                  takes the colour instead of only its outline. */}
              <circle cx="160" cy="160" r="96" fill={url('door-tint')} />
              <circle cx="160" cy="160" r="96" fill={url('door-vignette')} />
              {breached && (
                <path d="M160 64a96 96 0 0 0 0 192 78 96 0 0 1 0-192z" fill="#02070d" fillOpacity=".72" />
              )}
            </g>

            <path
              d="M91 118a78 78 0 0 1 51-45"
              fill="none"
              stroke="#f2fbff"
              strokeOpacity=".5"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Concentric machined rings, each bevelled. */}
            <circle cx="160" cy="160" r="93" fill="none" stroke={url('bevel')} strokeWidth="2" strokeOpacity=".85" />
            <circle cx="160" cy="160" r="89" fill="none" stroke={stateColor} strokeOpacity=".38" strokeWidth="2" strokeDasharray={breached ? '24 14' : '3 8'} />
            <circle cx="160" cy="160" r="84" fill="none" stroke={url('bevel-inv')} strokeWidth="1.6" strokeOpacity=".7" />

            {/* Inner recess the dial sits in: outer bevel, dark well,
                and an occlusion ring where it meets the face. */}
            <circle cx="160" cy="160" r="64" fill="#0f1e2c" stroke={url('bevel')} strokeWidth="7" />
            <circle cx="160" cy="160" r="60" fill="none" stroke="#060b0f" strokeOpacity=".8" strokeWidth="3" />
            <circle cx="160" cy="160" r="57" fill="none" stroke={url('bevel-inv')} strokeWidth="2" strokeOpacity=".8" />

            {/* Locking bolts around the door. Rotation uses an SVG
                transform on a wrapper group: the previous px-based
                `transformOrigin` in style never applied, which stacked
                all six at 12 o'clock. */}
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <g key={angle} transform={`rotate(${angle} 160 160)`}>
                <motion.g animate={breached && !reduceMotion ? { y: -16 } : undefined}>
                  {/* Cylindrical barrel: shading runs ACROSS the bolt
                      (dark edge → highlight → dark edge), which is what
                      separates a cylinder from a flat pill. */}
                  <rect x="153" y="55" width="14" height="33" rx="1.5" fill={url('bolt-barrel')} />
                  {/* Machined seams along the barrel. */}
                  <line x1="155.4" y1="57" x2="155.4" y2="87" stroke="#050d16" strokeOpacity=".75" strokeWidth="0.9" />
                  {/* Collar where the bolt enters the door. */}
                  <rect x="151.6" y="72" width="16.8" height="3.4" rx="1" fill={url('bolt-cap')} />
                  {/* Outer end cap, brighter with its own rim. */}
                  <rect x="151.4" y="50" width="17.2" height="7.5" rx="2.4" fill={url('bolt-cap')} stroke="#050d16" strokeWidth="0.7" />
                  <line x1="153.6" y1="52.2" x2="166.4" y2="52.2" stroke="#eaf6ff" strokeOpacity=".6" strokeWidth="1.1" strokeLinecap="round" />
                  {/* Contact shadow where it seats into the face. */}
                  <rect x="152.6" y="86.4" width="14.8" height="2.6" rx="1" fill="#040a12" fillOpacity=".85" />
                </motion.g>
              </g>
            ))}

            <motion.g
              style={{ transformOrigin: '160px 160px' }}
              animate={dialMotion ? { rotate: dialMotion } : undefined}
              transition={{ duration: state === 'attacking' ? 1.2 : 3, repeat: state === 'attacking' ? Infinity : 0, ease: 'linear' }}
            >
              {/* Dial bezel: thick bevel ring, then the engraved face. */}
              <circle cx="160" cy="160" r="50" fill="#08141f" stroke={url('bevel')} strokeWidth="5" />
              <circle cx="160" cy="160" r="47" fill="none" stroke={stateColor} strokeOpacity=".55" strokeWidth="2" />
              <circle cx="160" cy="160" r="44" fill={url('dial-face')} />
              <g clipPath={`url(#${id('dial-clip')})`}>
                {DIAL_GRAIN.map((ring) => (
                  <circle key={ring.r} cx="160" cy="160" r={ring.r} fill="none" stroke="#dceaf5" strokeOpacity={ring.opacity} strokeWidth="0.5" />
                ))}
                <rect x="110" y="110" width="100" height="100" fill={url('spec')} />
                <circle cx="160" cy="160" r="44" fill={url('door-tint')} />
              </g>

              {/* Engraved numerals: a light lower edge under a dark
                  face is what sells "cut into the metal". */}
              {DIAL_NUMERALS.map(({ value, angle }) => (
                <g key={value} transform={`rotate(${angle} 160 160)`}>
                  <text x="160" y="128.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#cfe2ef" fillOpacity=".22">{value}</text>
                  <text x="160" y="128" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#070d12" fillOpacity=".9">{value}</text>
                </g>
              ))}

              {/* Fine tick ring between numerals and hub. */}
              {Array.from({ length: 24 }, (_, i) => i * 15).map((angle) => (
                <line
                  key={angle}
                  x1="160"
                  y1="131"
                  x2="160"
                  y2={angle % 45 === 0 ? '135.5' : '133.5'}
                  stroke="#0a1218"
                  strokeOpacity=".65"
                  strokeWidth={angle % 45 === 0 ? 1.1 : 0.6}
                  transform={`rotate(${angle} 160 160)`}
                />
              ))}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <line key={angle} x1="160" y1="119" x2="160" y2="127" stroke={stateColor} strokeWidth="2" style={{ transformOrigin: '160px 160px', rotate: `${angle}deg` }} />
              ))}
              <path d="M160 160V130" stroke={stateColor} strokeWidth="5" strokeLinecap="round" />
            </motion.g>

            {/* Polished hub: bevelled collar, conical sweep, rim glint. */}
            <circle cx="160" cy="160" r="19" fill="#101e2d" stroke={url('bevel')} strokeWidth="3" />
            <circle cx="160" cy="160" r="14" fill={url('hub')} stroke="#070d12" strokeWidth="0.8" />
            <path d="M149 152a14 14 0 0 1 19-4" fill="none" stroke="#eaf6ff" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="160" cy="160" r="10" fill={stateColor} filter={`url(#${id('state-glow')})`} />
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
