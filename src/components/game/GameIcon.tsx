import type { ComponentType } from 'react';
import {
  AppWindow,
  Blocks,
  Bot,
  Boxes,
  BrainCircuit,
  Cable,
  CircleDotDashed,
  Code2,
  Crosshair,
  Dices,
  Fingerprint,
  Gauge,
  Grid2X2,
  Grid3X3,
  Hash,
  KeyRound,
  Keyboard,
  LockKeyhole,
  Orbit,
  Radio,
  RotateCw,
  ScanLine,
  Search,
  Shapes,
  ShieldEllipsis,
  Sparkles,
  Split,
  Target,
  Timer,
  Waypoints,
  WholeWord,
  Zap,
} from 'lucide-react';
import type { ModuleType } from '../../types';

const ICONS: Partial<Record<ModuleType, ComponentType<{ size?: number; strokeWidth?: number }>>> = {
  pattern: Waypoints,
  keypad: Keyboard,
  timing: Timer,
  combination: LockKeyhole,
  sequence: Hash,
  slider: Split,
  rotation: RotateCw,
  wire: Cable,
  fingerprint: Fingerprint,
  morse: Radio,
  colorcode: CircleDotDashed,
  safedial: Gauge,
  pacman: CircleDotDashed,
  spaceinvaders: Bot,
  frogger: AppWindow,
  donkeykong: Blocks,
  centipede: Orbit,
  asteroids: Crosshair,
  snake: Waypoints,
  breakout: Boxes,
  tetris: Blocks,
  galaga: Target,
  digdug: Grid3X3,
  qbert: Dices,
  quickmath: Hash,
  wordscramble: WholeWord,
  memorymatch: Grid2X2,
  sudoku: Grid3X3,
  jigsaw: Shapes,
  wordsearch: Search,
  logic: BrainCircuit,
  maze: Grid3X3,
  spotdiff: ScanLine,
  reaction: Zap,
  numsequence: Code2,
  cipher: KeyRound,
  custom: Sparkles,
};

interface GameIconProps {
  type: ModuleType | string;
  size?: number;
  label?: string;
  className?: string;
  decorative?: boolean;
}

/** A single, SVG-based visual vocabulary for every lock and game. */
export const GameIcon = ({
  type,
  size = 24,
  label,
  className = '',
  decorative = true,
}: GameIconProps) => {
  const Icon = ICONS[type as ModuleType] ?? ShieldEllipsis;
  return (
    <span
      className={`game-icon ${className}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label ?? `${type} game`}
      aria-hidden={decorative ? true : undefined}
    >
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
};

export const GameEmblem = ({ type, className = '' }: { type: ModuleType | string; className?: string }) => (
  <span className={`game-emblem ${className}`} aria-hidden="true">
    <GameIcon type={type} size={28} />
    <span className="game-emblem__orbit" />
  </span>
);
