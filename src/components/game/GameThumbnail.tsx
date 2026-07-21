import { getGameMotif, type GameMotif } from '../../game/catalog';
import type { ModuleType } from '../../types';

// Per-game animated thumbnail (Section 6). Pure SVG + CSS: the animation
// is defined in index.css and stays PAUSED until the containing card is
// hovered, focused, or selected — so a catalog of ~40 cards costs nothing
// at rest, and prefers-reduced-motion freezes every motif to a still frame.

const Motif = ({ motif }: { motif: GameMotif }) => {
  switch (motif) {
    case 'dial':
      return (
        <>
          <circle cx="24" cy="24" r="17" className="thumb-stroke" />
          <path d="M12 15 A17 17 0 0 1 36 15" className="thumb-accent thumb-arc" />
          <line x1="24" y1="24" x2="24" y2="9" className="thumb-accent thumb-needle" />
          <circle cx="24" cy="24" r="3" className="thumb-fill" />
        </>
      );
    case 'grid':
      return (
        <>
          {[10, 24, 38].map((y) => [10, 24, 38].map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2" className="thumb-dot" />
          )))}
          <rect x="6" y="6" width="8" height="8" rx="2" className="thumb-accent thumb-runner" />
        </>
      );
    case 'stack':
      return (
        <>
          <line x1="9" y1="41" x2="39" y2="41" className="thumb-stroke" />
          <rect x="14" y="31" width="20" height="7" rx="1" className="thumb-accent thumb-block thumb-block--1" />
          <rect x="15" y="22" width="18" height="7" rx="1" className="thumb-accent thumb-block thumb-block--2" />
          <rect x="16" y="13" width="16" height="7" rx="1" className="thumb-accent thumb-block thumb-block--3" />
        </>
      );
    case 'burst':
      return (
        <>
          <circle cx="24" cy="12" r="3" className="thumb-dot thumb-target" />
          <path d="M24 40 L18 34 L30 34 Z" className="thumb-fill" />
          <rect x="22.5" y="30" width="3" height="7" rx="1.5" className="thumb-accent thumb-shot" />
        </>
      );
    case 'path':
    default:
      return (
        <>
          <path d="M9 35 L20 35 L20 13 L39 13" className="thumb-accent thumb-trace" fill="none" />
          <circle cx="9" cy="35" r="3" className="thumb-fill" />
          <circle cx="39" cy="13" r="3" className="thumb-accent-fill thumb-node" />
        </>
      );
  }
};

export const GameThumbnail = ({
  type,
  size = 54,
  className = '',
}: {
  type: ModuleType | string;
  size?: number;
  className?: string;
}) => {
  const motif = getGameMotif(type);
  return (
    <span
      className={`game-thumb game-thumb--${motif} ${className}`}
      style={{ '--thumb-size': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="game-thumb__svg">
        <Motif motif={motif} />
      </svg>
    </span>
  );
};
