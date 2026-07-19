import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { MiniGameProps, ModuleType } from '../../types';

type LazyGame = LazyExoticComponent<ComponentType<MiniGameProps>>;
type GameModule = Record<string, unknown>;
type GameLoader = () => Promise<GameModule>;

/** Raw chunk loaders, kept alongside the lazy components so callers can
 *  warm the chunk cache (see preloadMiniGames) — e.g. the attack screen
 *  preloads every lock in the sequence the moment the stake is committed,
 *  so no breach time is burned on "Loading lock mechanism…". */
const GAME_LOADERS: Partial<Record<ModuleType, { loader: GameLoader; exportName: string }>> = {
  pattern: { loader: () => import('./PatternLock'), exportName: 'PatternLock' },
  keypad: { loader: () => import('./Keypad'), exportName: 'Keypad' },
  timing: { loader: () => import('./TimingLock'), exportName: 'TimingLock' },
  combination: { loader: () => import('./CombinationLock'), exportName: 'CombinationLock' },
  sequence: { loader: () => import('./SequenceLock'), exportName: 'SequenceLock' },
  slider: { loader: () => import('./SliderLock'), exportName: 'SliderLock' },
  rotation: { loader: () => import('./RotationLock'), exportName: 'RotationLock' },
  wire: { loader: () => import('./WireLock'), exportName: 'WireLock' },
  fingerprint: { loader: () => import('./FingerprintLock'), exportName: 'FingerprintLock' },
  morse: { loader: () => import('./MorseLock'), exportName: 'MorseLock' },
  colorcode: { loader: () => import('./ColorCodeLock'), exportName: 'ColorCodeLock' },
  safedial: { loader: () => import('./SafeDialLock'), exportName: 'SafeDialLock' },
  pacman: { loader: () => import('./PacmanGame'), exportName: 'PacmanGame' },
  spaceinvaders: { loader: () => import('./SpaceInvaders'), exportName: 'SpaceInvaders' },
  frogger: { loader: () => import('./FroggerGame'), exportName: 'FroggerGame' },
  donkeykong: { loader: () => import('./DonkeyKong'), exportName: 'DonkeyKong' },
  centipede: { loader: () => import('./CentipedeGame'), exportName: 'CentipedeGame' },
  asteroids: { loader: () => import('./AsteroidsGame'), exportName: 'AsteroidsGame' },
  snake: { loader: () => import('./SnakeGame'), exportName: 'SnakeGame' },
  breakout: { loader: () => import('./BreakoutGame'), exportName: 'BreakoutGame' },
  tetris: { loader: () => import('./TetrisGame'), exportName: 'TetrisGame' },
  galaga: { loader: () => import('./GalagaGame'), exportName: 'GalagaGame' },
  digdug: { loader: () => import('./DigDugGame'), exportName: 'DigDugGame' },
  qbert: { loader: () => import('./QbertGame'), exportName: 'QbertGame' },
  quickmath: { loader: () => import('./QuickMath'), exportName: 'QuickMath' },
  wordscramble: { loader: () => import('./WordScramble'), exportName: 'WordScramble' },
  memorymatch: { loader: () => import('./MemoryMatch'), exportName: 'MemoryMatch' },
  sudoku: { loader: () => import('./SudokuGame'), exportName: 'SudokuGame' },
  jigsaw: { loader: () => import('./JigsawGame'), exportName: 'JigsawGame' },
  wordsearch: { loader: () => import('./WordSearchGame'), exportName: 'WordSearchGame' },
  logic: { loader: () => import('./LogicGame'), exportName: 'LogicGame' },
  maze: { loader: () => import('./MazeGame'), exportName: 'MazeGame' },
  spotdiff: { loader: () => import('./SpotDiffGame'), exportName: 'SpotDiffGame' },
  reaction: { loader: () => import('./ReactionGame'), exportName: 'ReactionGame' },
  numsequence: { loader: () => import('./NumSequenceGame'), exportName: 'NumSequenceGame' },
  cipher: { loader: () => import('./CipherGame'), exportName: 'CipherGame' },
};

const lazyGame = ({ loader, exportName }: { loader: GameLoader; exportName: string }): LazyGame => lazy(async () => {
  const module = await loader();
  return { default: module[exportName] as ComponentType<MiniGameProps> };
});

/** Each registry entry is a separate Vite chunk; the registry contract remains keyed by ModuleType. */
export const MINIGAME_REGISTRY: Partial<Record<ModuleType, LazyGame>> = Object.fromEntries(
  (Object.entries(GAME_LOADERS) as [ModuleType, { loader: GameLoader; exportName: string }][]).map(
    ([type, spec]) => [type, lazyGame(spec)],
  ),
) as Partial<Record<ModuleType, LazyGame>>;

export function getMiniGameComponent(type: ModuleType): LazyGame | null {
  return MINIGAME_REGISTRY[type] ?? null;
}

/** Fire-and-forget warmup of the lazy chunks for the given module types. */
export function preloadMiniGames(types: (ModuleType | string)[]): void {
  for (const type of types) {
    const spec = GAME_LOADERS[type as ModuleType];
    if (spec) void spec.loader().catch(() => {});
  }
}
