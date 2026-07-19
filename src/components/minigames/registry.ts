import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { MiniGameProps, ModuleType } from '../../types';

type LazyGame = LazyExoticComponent<ComponentType<MiniGameProps>>;
type GameModule = Record<string, unknown>;

const lazyGame = (loader: () => Promise<GameModule>, exportName: string): LazyGame => lazy(async () => {
  const module = await loader();
  return { default: module[exportName] as ComponentType<MiniGameProps> };
});

/** Each registry entry is a separate Vite chunk; the registry contract remains keyed by ModuleType. */
export const MINIGAME_REGISTRY: Partial<Record<ModuleType, LazyGame>> = {
  pattern: lazyGame(() => import('./PatternLock'), 'PatternLock'),
  keypad: lazyGame(() => import('./Keypad'), 'Keypad'),
  timing: lazyGame(() => import('./TimingLock'), 'TimingLock'),
  combination: lazyGame(() => import('./CombinationLock'), 'CombinationLock'),
  sequence: lazyGame(() => import('./SequenceLock'), 'SequenceLock'),
  slider: lazyGame(() => import('./SliderLock'), 'SliderLock'),
  rotation: lazyGame(() => import('./RotationLock'), 'RotationLock'),
  wire: lazyGame(() => import('./WireLock'), 'WireLock'),
  fingerprint: lazyGame(() => import('./FingerprintLock'), 'FingerprintLock'),
  morse: lazyGame(() => import('./MorseLock'), 'MorseLock'),
  colorcode: lazyGame(() => import('./ColorCodeLock'), 'ColorCodeLock'),
  safedial: lazyGame(() => import('./SafeDialLock'), 'SafeDialLock'),
  pacman: lazyGame(() => import('./PacmanGame'), 'PacmanGame'),
  spaceinvaders: lazyGame(() => import('./SpaceInvaders'), 'SpaceInvaders'),
  frogger: lazyGame(() => import('./FroggerGame'), 'FroggerGame'),
  donkeykong: lazyGame(() => import('./DonkeyKong'), 'DonkeyKong'),
  centipede: lazyGame(() => import('./CentipedeGame'), 'CentipedeGame'),
  asteroids: lazyGame(() => import('./AsteroidsGame'), 'AsteroidsGame'),
  snake: lazyGame(() => import('./SnakeGame'), 'SnakeGame'),
  breakout: lazyGame(() => import('./BreakoutGame'), 'BreakoutGame'),
  tetris: lazyGame(() => import('./TetrisGame'), 'TetrisGame'),
  galaga: lazyGame(() => import('./GalagaGame'), 'GalagaGame'),
  digdug: lazyGame(() => import('./DigDugGame'), 'DigDugGame'),
  qbert: lazyGame(() => import('./QbertGame'), 'QbertGame'),
  quickmath: lazyGame(() => import('./QuickMath'), 'QuickMath'),
  wordscramble: lazyGame(() => import('./WordScramble'), 'WordScramble'),
  memorymatch: lazyGame(() => import('./MemoryMatch'), 'MemoryMatch'),
  sudoku: lazyGame(() => import('./SudokuGame'), 'SudokuGame'),
  jigsaw: lazyGame(() => import('./JigsawGame'), 'JigsawGame'),
  wordsearch: lazyGame(() => import('./WordSearchGame'), 'WordSearchGame'),
  logic: lazyGame(() => import('./LogicGame'), 'LogicGame'),
  maze: lazyGame(() => import('./MazeGame'), 'MazeGame'),
  spotdiff: lazyGame(() => import('./SpotDiffGame'), 'SpotDiffGame'),
  reaction: lazyGame(() => import('./ReactionGame'), 'ReactionGame'),
  numsequence: lazyGame(() => import('./NumSequenceGame'), 'NumSequenceGame'),
  cipher: lazyGame(() => import('./CipherGame'), 'CipherGame'),
};

export function getMiniGameComponent(type: ModuleType): LazyGame | null {
  return MINIGAME_REGISTRY[type] ?? null;
}
