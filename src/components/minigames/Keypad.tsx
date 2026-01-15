import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete } from 'lucide-react';
import { KeypadConfig, MiniGameResult } from '../../types';
import { scoreKeypadAttempt } from '../../game/modules';

interface KeypadProps {
  config: KeypadConfig;
  onComplete: (result: MiniGameResult) => void;
}

export const Keypad = ({ config, onComplete }: KeypadProps) => {
  const [showSequence, setShowSequence] = useState(true);
  const [userInput, setUserInput] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [keyOrder, setKeyOrder] = useState<string[]>([]);

  const { sequence, displayTime, shuffleKeys, sequenceLength } = config;

  // Set up key order
  useEffect(() => {
    const baseKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    if (shuffleKeys) {
      const shuffled = [...baseKeys].sort(() => Math.random() - 0.5);
      setKeyOrder(shuffled);
    } else {
      setKeyOrder(baseKeys);
    }
  }, [shuffleKeys]);

  // Show sequence then hide
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSequence(false);
      setStartTime(Date.now());
    }, displayTime);

    return () => clearTimeout(timer);
  }, [displayTime]);

  const handleComplete = useCallback(
    (input: string) => {
      const timeSpent = startTime ? Date.now() - startTime : 0;
      const score = scoreKeypadAttempt(config, input, timeSpent);

      onComplete({
        moduleId: 'keypad',
        moduleType: 'keypad',
        score,
        passed: score >= 0.65,
        timeSpent,
      });
    },
    [config, startTime, onComplete]
  );

  const handleKeyPress = (key: string) => {
    if (showSequence) return;

    const newInput = userInput + key;
    setUserInput(newInput);

    if (newInput.length >= sequenceLength) {
      handleComplete(newInput);
    }
  };

  const handleDelete = () => {
    if (showSequence) return;
    setUserInput((prev) => prev.slice(0, -1));
  };

  // Render key in 3x4 grid layout
  const renderKey = (key: string, index: number) => {
    const isPressed = userInput.includes(key) && userInput.lastIndexOf(key) === userInput.length - 1;

    return (
      <motion.button
        key={key}
        onClick={() => handleKeyPress(key)}
        disabled={showSequence}
        className={`
          w-16 h-16 rounded-xl font-display text-2xl font-bold
          flex items-center justify-center
          transition-colors
          ${
            showSequence
              ? 'bg-surface-light text-text-dim'
              : 'bg-surface-light hover:bg-primary/20 text-text active:bg-primary active:text-background'
          }
        `}
        whileTap={{ scale: 0.95 }}
      >
        {key}
      </motion.button>
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* Sequence Display */}
      <div className="mb-6 text-center">
        {showSequence ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className="text-sm text-text-dim mb-2">Memorize this code:</p>
            <div className="flex gap-2 justify-center">
              {sequence.split('').map((digit, i) => (
                <motion.span
                  key={i}
                  className="w-12 h-14 bg-primary/20 rounded-lg flex items-center justify-center font-display text-2xl font-bold text-primary neon-text-primary"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  {digit}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ) : (
          <div>
            <p className="text-sm text-text-dim mb-2">Enter the code:</p>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: sequenceLength }).map((_, i) => {
                const digit = userInput[i];
                const isCorrect = digit === sequence[i];
                const isWrong = digit && !isCorrect;

                return (
                  <div
                    key={i}
                    className={`
                      w-12 h-14 rounded-lg flex items-center justify-center
                      font-display text-2xl font-bold
                      border-2 transition-colors
                      ${
                        digit
                          ? isCorrect
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-danger/20 border-danger text-danger'
                          : 'bg-surface-light border-surface-light text-text-dim'
                      }
                    `}
                  >
                    {digit || (i === userInput.length ? '_' : '')}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-3">
        {keyOrder.slice(0, 9).map((key, i) => renderKey(key, i))}

        {/* Bottom row: empty, 0, delete */}
        <div className="w-16 h-16" /> {/* Empty space */}
        {renderKey(keyOrder[9], 9)}
        <motion.button
          onClick={handleDelete}
          disabled={showSequence || userInput.length === 0}
          className={`
            w-16 h-16 rounded-xl flex items-center justify-center
            transition-colors
            ${
              showSequence || userInput.length === 0
                ? 'bg-surface-light text-text-dim/50'
                : 'bg-surface-light hover:bg-danger/20 text-text-dim hover:text-danger'
            }
          `}
          whileTap={{ scale: 0.95 }}
        >
          <Delete size={24} />
        </motion.button>
      </div>

      {/* Shuffle indicator */}
      {shuffleKeys && !showSequence && (
        <p className="mt-4 text-xs text-warning">
          Keys are shuffled!
        </p>
      )}
    </div>
  );
};
