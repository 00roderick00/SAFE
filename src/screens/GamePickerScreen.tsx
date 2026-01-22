import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Check, X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { MODULE_CONFIG, MODULE_CATEGORIES } from '../game/constants';
import { getModulesByCategory } from '../game/modules';
import { ModuleType } from '../types';

// Import all mini-games for preview
import {
  // Original Arcade
  PacmanGame,
  SpaceInvaders,
  FroggerGame,
  DonkeyKong,
  CentipedeGame,
  AsteroidsGame,
  // New Arcade
  SnakeGame,
  BreakoutGame,
  TetrisGame,
  GalagaGame,
  DigDugGame,
  QbertGame,
  // Original Puzzle
  QuickMath,
  WordScramble,
  MemoryMatch,
  // New Puzzle
  SudokuGame,
  JigsawGame,
  WordSearchGame,
  LogicGame,
  MazeGame,
  SpotDiffGame,
  ReactionGame,
  NumSequenceGame,
  CipherGame,
  // Original Classic
  PatternLock,
  Keypad,
  TimingLock,
  // New Classic
  CombinationLock,
  SequenceLock,
  SliderLock,
  RotationLock,
  WireLock,
  FingerprintLock,
  MorseLock,
  ColorCodeLock,
  SafeDialLock,
} from '../components/minigames';
import { generateMiniGameConfig } from '../game/modules';

export const GamePickerScreen = () => {
  const navigate = useNavigate();
  const { slotIndex } = useParams<{ slotIndex: string }>();
  const index = parseInt(slotIndex || '0', 10);

  const { securityLoadout, setModuleType, setModuleDifficulty } = usePlayerStore();
  const currentModule = securityLoadout.modules[index];

  const [selectedType, setSelectedType] = useState<ModuleType>(currentModule?.type || 'pacman');
  const [difficulty, setDifficulty] = useState(currentModule?.difficulty || 0.5);
  const [isPlaying, setIsPlaying] = useState(false);

  const modulesByCategory = getModulesByCategory();

  const handleSelectGame = (type: ModuleType) => {
    setSelectedType(type);
  };

  const handleTryGame = () => {
    setIsPlaying(true);
  };

  const handleGameComplete = () => {
    setIsPlaying(false);
  };

  const handleConfirm = () => {
    setModuleType(index, selectedType);
    setModuleDifficulty(index, difficulty);
    navigate('/security');
  };

  const selectedConfig = MODULE_CONFIG[selectedType as keyof typeof MODULE_CONFIG];

  const renderGamePreview = () => {
    if (!isPlaying) return null;

    const mockModule = {
      id: 'preview',
      type: selectedType,
      difficulty,
      weight: 1,
      name: selectedConfig?.name || 'Game',
      description: selectedConfig?.description || '',
    };

    const props = { difficulty, onComplete: handleGameComplete };

    switch (selectedType) {
      // Original Arcade Games
      case 'pacman':
        return <PacmanGame {...props} />;
      case 'spaceinvaders':
        return <SpaceInvaders {...props} />;
      case 'frogger':
        return <FroggerGame {...props} />;
      case 'donkeykong':
        return <DonkeyKong {...props} />;
      case 'centipede':
        return <CentipedeGame {...props} />;
      case 'asteroids':
        return <AsteroidsGame {...props} />;

      // New Arcade Games
      case 'snake':
        return <SnakeGame {...props} />;
      case 'breakout':
        return <BreakoutGame {...props} />;
      case 'tetris':
        return <TetrisGame {...props} />;
      case 'galaga':
        return <GalagaGame {...props} />;
      case 'digdug':
        return <DigDugGame {...props} />;
      case 'qbert':
        return <QbertGame {...props} />;

      // Original Puzzle Games
      case 'quickmath':
        return <QuickMath {...props} />;
      case 'wordscramble':
        return <WordScramble {...props} />;
      case 'memorymatch':
        return <MemoryMatch {...props} />;

      // New Puzzle Games
      case 'sudoku':
        return <SudokuGame {...props} />;
      case 'jigsaw':
        return <JigsawGame {...props} />;
      case 'wordsearch':
        return <WordSearchGame {...props} />;
      case 'logic':
        return <LogicGame {...props} />;
      case 'maze':
        return <MazeGame {...props} />;
      case 'spotdiff':
        return <SpotDiffGame {...props} />;
      case 'reaction':
        return <ReactionGame {...props} />;
      case 'numsequence':
        return <NumSequenceGame {...props} />;
      case 'cipher':
        return <CipherGame {...props} />;

      // Original Classic Locks
      case 'pattern':
        return <PatternLock config={generateMiniGameConfig(mockModule) as any} onComplete={handleGameComplete} />;
      case 'keypad':
        return <Keypad config={generateMiniGameConfig(mockModule) as any} onComplete={handleGameComplete} />;
      case 'timing':
        return <TimingLock config={generateMiniGameConfig(mockModule) as any} onComplete={handleGameComplete} />;

      // New Classic Locks
      case 'combination':
        return <CombinationLock {...props} />;
      case 'sequence':
        return <SequenceLock {...props} />;
      case 'slider':
        return <SliderLock {...props} />;
      case 'rotation':
        return <RotationLock {...props} />;
      case 'wire':
        return <WireLock {...props} />;
      case 'fingerprint':
        return <FingerprintLock {...props} />;
      case 'morse':
        return <MorseLock {...props} />;
      case 'colorcode':
        return <ColorCodeLock {...props} />;
      case 'safedial':
        return <SafeDialLock {...props} />;

      default:
        return (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">{selectedConfig?.icon}</span>
            <p className="text-text-dim">Game preview coming soon</p>
          </div>
        );
    }
  };

  // Order categories: arcade, puzzle, classic
  const categoryOrder = ['arcade', 'puzzle', 'classic'];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/security')}
              className="p-2 -ml-2 text-text-dim hover:text-text"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="ml-2 text-lg font-semibold">
              Lock #{index + 1}
            </h1>
          </div>
          {!isPlaying && (
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-background font-medium rounded-xl"
            >
              <Check size={18} />
              Save
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-6">
        {/* Preview/Test Area */}
        <AnimatePresence mode="wait">
          {isPlaying ? (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="card-clean p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-text-dim">Testing: {selectedConfig?.name}</span>
                  <button
                    onClick={() => setIsPlaying(false)}
                    className="p-2 text-text-dim hover:text-text"
                  >
                    <X size={20} />
                  </button>
                </div>
                {renderGamePreview()}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="card-clean p-6 text-center">
                <span className="text-6xl block mb-3">{selectedConfig?.icon}</span>
                <h2 className="text-xl font-semibold mb-1">{selectedConfig?.name}</h2>
                <p className="text-text-dim text-sm mb-4">{selectedConfig?.description}</p>

                <button
                  onClick={handleTryGame}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-light border border-border rounded-xl text-text hover:border-primary/50 transition-colors"
                >
                  <Play size={18} />
                  Try It
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Selection Grid */}
        {!isPlaying && (
          <>
            {categoryOrder.map((catKey) => {
              const catInfo = MODULE_CATEGORIES[catKey as keyof typeof MODULE_CATEGORIES];
              const games = modulesByCategory[catKey as keyof typeof modulesByCategory];
              if (!games || games.length === 0) return null;

              return (
                <div key={catKey} className="mb-6">
                  <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
                    {catInfo.name}
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {games.map((game) => (
                      <motion.button
                        key={game.type}
                        className={`
                          flex flex-col items-center justify-center p-3
                          rounded-xl transition-all
                          ${selectedType === game.type
                            ? 'bg-primary/20 border-2 border-primary'
                            : 'bg-surface border border-border hover:border-primary/30'
                          }
                        `}
                        onClick={() => handleSelectGame(game.type as ModuleType)}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-2xl mb-1">{game.icon}</span>
                        <span className={`text-xs truncate w-full text-center ${
                          selectedType === game.type ? 'text-primary' : 'text-text-dim'
                        }`}>
                          {game.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Difficulty Slider */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-text-dim mb-3 uppercase tracking-wide">
                Difficulty
              </h3>
              <div className="card-clean p-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-light rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-text-dim">Easy</span>
                  <span className={`font-medium ${
                    difficulty < 0.33 ? 'text-primary' : difficulty < 0.66 ? 'text-warning' : 'text-danger'
                  }`}>
                    {difficulty < 0.33 ? 'Easy' : difficulty < 0.66 ? 'Medium' : 'Hard'}
                  </span>
                  <span className="text-text-dim">Hard</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
