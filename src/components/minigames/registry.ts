import type { ComponentType } from 'react';
import type { MiniGameProps, ModuleType } from '../../types';

import { PatternLock } from './PatternLock';
import { Keypad } from './Keypad';
import { TimingLock } from './TimingLock';
import { CombinationLock } from './CombinationLock';
import { SequenceLock } from './SequenceLock';
import { SliderLock } from './SliderLock';
import { RotationLock } from './RotationLock';
import { WireLock } from './WireLock';
import { FingerprintLock } from './FingerprintLock';
import { MorseLock } from './MorseLock';
import { ColorCodeLock } from './ColorCodeLock';
import { SafeDialLock } from './SafeDialLock';

import { PacmanGame } from './PacmanGame';
import { SpaceInvaders } from './SpaceInvaders';
import { FroggerGame } from './FroggerGame';
import { DonkeyKong } from './DonkeyKong';
import { CentipedeGame } from './CentipedeGame';
import { AsteroidsGame } from './AsteroidsGame';
import { SnakeGame } from './SnakeGame';
import { BreakoutGame } from './BreakoutGame';
import { TetrisGame } from './TetrisGame';
import { GalagaGame } from './GalagaGame';
import { DigDugGame } from './DigDugGame';
import { QbertGame } from './QbertGame';

import { QuickMath } from './QuickMath';
import { WordScramble } from './WordScramble';
import { MemoryMatch } from './MemoryMatch';
import { SudokuGame } from './SudokuGame';
import { JigsawGame } from './JigsawGame';
import { WordSearchGame } from './WordSearchGame';
import { LogicGame } from './LogicGame';
import { MazeGame } from './MazeGame';
import { SpotDiffGame } from './SpotDiffGame';
import { ReactionGame } from './ReactionGame';
import { NumSequenceGame } from './NumSequenceGame';
import { CipherGame } from './CipherGame';

export const MINIGAME_REGISTRY: Partial<Record<ModuleType, ComponentType<MiniGameProps>>> = {
  pattern: PatternLock,
  keypad: Keypad,
  timing: TimingLock,
  combination: CombinationLock,
  sequence: SequenceLock,
  slider: SliderLock,
  rotation: RotationLock,
  wire: WireLock,
  fingerprint: FingerprintLock,
  morse: MorseLock,
  colorcode: ColorCodeLock,
  safedial: SafeDialLock,

  pacman: PacmanGame,
  spaceinvaders: SpaceInvaders,
  frogger: FroggerGame,
  donkeykong: DonkeyKong,
  centipede: CentipedeGame,
  asteroids: AsteroidsGame,
  snake: SnakeGame,
  breakout: BreakoutGame,
  tetris: TetrisGame,
  galaga: GalagaGame,
  digdug: DigDugGame,
  qbert: QbertGame,

  quickmath: QuickMath,
  wordscramble: WordScramble,
  memorymatch: MemoryMatch,
  sudoku: SudokuGame,
  jigsaw: JigsawGame,
  wordsearch: WordSearchGame,
  logic: LogicGame,
  maze: MazeGame,
  spotdiff: SpotDiffGame,
  reaction: ReactionGame,
  numsequence: NumSequenceGame,
  cipher: CipherGame,
};

export function getMiniGameComponent(type: ModuleType): ComponentType<MiniGameProps> | null {
  return MINIGAME_REGISTRY[type] ?? null;
}
