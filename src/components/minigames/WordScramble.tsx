import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface WordScrambleProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const EASY_WORDS = ['cat', 'dog', 'sun', 'hat', 'run', 'cup', 'pen', 'box', 'key', 'map'];
const MEDIUM_WORDS = ['apple', 'beach', 'clock', 'dream', 'eagle', 'flame', 'grape', 'house', 'juice', 'knife'];
const HARD_WORDS = ['python', 'dragon', 'castle', 'bridge', 'stream', 'planet', 'knight', 'throne', 'forest', 'garden'];

export const WordScramble = ({ difficulty, onComplete }: WordScrambleProps) => {
  const [currentWord, setCurrentWord] = useState('');
  const [scrambledWord, setScrambledWord] = useState('');
  const [userInput, setUserInput] = useState('');
  const [score, setScore] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const startTime = useRef(Date.now());

  const scrambleWord = (word: string): string => {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Make sure it's actually scrambled
    const scrambled = arr.join('');
    if (scrambled === word && word.length > 2) {
      return scrambleWord(word);
    }
    return scrambled;
  };

  const getWordList = () => {
    if (difficulty < 0.33) return EASY_WORDS;
    if (difficulty < 0.66) return MEDIUM_WORDS;
    return HARD_WORDS;
  };

  const generateNewWord = useCallback(() => {
    const words = getWordList();
    const word = words[Math.floor(Math.random() * words.length)];
    setCurrentWord(word);
    setScrambledWord(scrambleWord(word));
    setUserInput('');
    setTotalWords((t) => t + 1);
  }, [difficulty]);

  // Initialize first word
  useEffect(() => {
    generateNewWord();
  }, []);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleGameEnd();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const accuracy = totalWords > 0 ? score / totalWords : 0;

    onComplete({
      moduleId: 'wordscramble',
      moduleType: 'wordscramble',
      score: accuracy,
      passed: accuracy >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalWords, onComplete]);

  const handleSubmit = () => {
    if (gameOver) return;

    if (userInput.toLowerCase() === currentWord.toLowerCase()) {
      setScore((s) => s + 1);
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setFeedback(null);
      generateNewWord();
    }, 500);
  };

  const handleKeyPress = (key: string) => {
    if (gameOver) return;
    if (key === 'backspace') {
      setUserInput((prev) => prev.slice(0, -1));
    } else if (key === 'enter') {
      handleSubmit();
    } else if (userInput.length < currentWord.length) {
      setUserInput((prev) => prev + key);
    }
  };

  const keyboard = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-4 px-2">
        <span className="text-primary font-display">Score: {score}/{totalWords}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Scrambled Word Display */}
      <motion.div
        className={`w-full max-w-xs p-6 rounded-xl text-center mb-4 ${
          feedback === 'correct'
            ? 'bg-primary/20 border-2 border-primary'
            : feedback === 'wrong'
            ? 'bg-danger/20 border-2 border-danger'
            : 'bg-surface border-2 border-primary/30'
        }`}
        animate={{
          scale: feedback ? [1, 1.05, 1] : 1,
        }}
      >
        <p className="text-sm text-text-dim mb-2">Unscramble:</p>
        <span className="font-display text-3xl font-bold text-warning tracking-wider">
          {scrambledWord.toUpperCase()}
        </span>
      </motion.div>

      {/* User Input Display */}
      <div className="w-full max-w-xs p-4 bg-surface-light rounded-xl text-center mb-4">
        <div className="flex justify-center gap-1">
          {Array.from({ length: currentWord.length }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-10 border-b-2 flex items-center justify-center font-display text-2xl ${
                userInput[i] ? 'border-primary text-text' : 'border-text-dim'
              }`}
            >
              {userInput[i]?.toUpperCase() || ''}
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard */}
      <div className="w-full max-w-xs space-y-1">
        {keyboard.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-1">
            {row.map((key) => (
              <button
                key={key}
                className={`${
                  key === 'backspace' ? 'px-3' : 'w-7'
                } h-10 bg-surface-light rounded font-display text-sm active:bg-primary/20 transition-colors flex items-center justify-center`}
                onClick={() => handleKeyPress(key)}
              >
                {key === 'backspace' ? '⌫' : key.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
        <div className="flex justify-center mt-2">
          <button
            className="px-12 py-2 bg-primary rounded-lg text-background font-bold active:bg-primary/80"
            onClick={handleSubmit}
          >
            SUBMIT
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm text-text-dim">Unscramble as many words as you can!</p>
    </div>
  );
};
