import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface CipherGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const WORDS = ['SAFE', 'CODE', 'LOCK', 'HACK', 'KEY', 'PASS', 'DOOR', 'OPEN', 'SHUT', 'BOLT'];

export const CipherGame = ({ difficulty, onComplete }: CipherGameProps) => {
  const [word, setWord] = useState('');
  const [cipher, setCipher] = useState<Map<string, string>>(new Map());
  const [encodedWord, setEncodedWord] = useState('');
  const [input, setInput] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hints, setHints] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(50);
  const startTime = useRef(Date.now());

  const totalRounds = Math.floor(2 + difficulty * 2);
  const maxHints = 2;

  const generateCipher = useCallback(() => {
    // Select random word
    const selectedWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    setWord(selectedWord);

    // Create substitution cipher
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const shuffled = [...alphabet].sort(() => Math.random() - 0.5).join('');
    const cipherMap = new Map<string, string>();

    for (let i = 0; i < alphabet.length; i++) {
      cipherMap.set(alphabet[i], shuffled[i]);
    }

    setCipher(cipherMap);

    // Encode the word
    const encoded = selectedWord.split('').map(char => cipherMap.get(char) || char).join('');
    setEncodedWord(encoded);

    // Reset input
    setInput(new Array(selectedWord.length).fill(''));
    setCurrentIndex(0);
    setHints(new Set());
  }, []);

  useEffect(() => {
    generateCipher();
  }, [generateCipher]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = score / totalRounds;
    onComplete({
      moduleId: 'cipher',
      moduleType: 'cipher',
      score: scoreRatio,
      passed: score >= Math.ceil(totalRounds * 0.6),
      timeSpent,
    });
  }, [gameOver, score, totalRounds, onComplete]);

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
  }, [gameOver, handleGameEnd]);

  const handleLetterInput = (letter: string) => {
    if (gameOver || currentIndex >= word.length) return;

    const newInput = [...input];
    newInput[currentIndex] = letter;
    setInput(newInput);

    // Check if letter is correct
    if (letter === word[currentIndex]) {
      // Move to next unfilled position
      let nextIndex = currentIndex + 1;
      while (nextIndex < word.length && hints.has(nextIndex)) {
        nextIndex++;
      }
      setCurrentIndex(nextIndex);

      // Check if word is complete
      if (nextIndex >= word.length || newInput.every((l, i) => l === word[i])) {
        setScore(s => s + 1);

        setTimeout(() => {
          if (currentRound + 1 >= totalRounds) {
            handleGameEnd();
          } else {
            setCurrentRound(r => r + 1);
            generateCipher();
          }
        }, 1000);
      }
    } else {
      // Wrong letter - clear it after brief display
      setTimeout(() => {
        const clearedInput = [...input];
        clearedInput[currentIndex] = '';
        setInput(clearedInput);
      }, 300);
    }
  };

  const useHint = () => {
    if (hints.size >= maxHints || gameOver) return;

    // Find first empty position
    const emptyIndex = input.findIndex((l, i) => l === '' && !hints.has(i));
    if (emptyIndex === -1) return;

    const newInput = [...input];
    newInput[emptyIndex] = word[emptyIndex];
    setInput(newInput);
    setHints(new Set([...hints, emptyIndex]));

    // Update current index if needed
    if (emptyIndex === currentIndex) {
      let nextIndex = currentIndex + 1;
      while (nextIndex < word.length && (hints.has(nextIndex) || newInput[nextIndex] !== '')) {
        nextIndex++;
      }
      setCurrentIndex(nextIndex);
    }
  };

  // Create alphabet rows
  const alphabetRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Score: {score}/{totalRounds}</span>
        <span>Hints: {maxHints - hints.size} left</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-2">Decode the cipher</p>

      {/* Encoded word display */}
      <div className="flex gap-2 mb-2">
        {encodedWord.split('').map((char, i) => (
          <div
            key={`enc-${i}`}
            className="w-10 h-10 bg-surface border border-border rounded flex items-center justify-center text-xl font-mono text-warning"
          >
            {char}
          </div>
        ))}
      </div>

      {/* Arrow */}
      <div className="text-2xl mb-2">↓</div>

      {/* Decoded word input */}
      <div className="flex gap-2 mb-4">
        {input.map((char, i) => (
          <div
            key={`dec-${i}`}
            className={`w-10 h-10 rounded flex items-center justify-center text-xl font-mono
              ${i === currentIndex ? 'bg-primary/30 border-2 border-primary' :
                hints.has(i) ? 'bg-surface-light border border-text-dim' :
                char ? 'bg-primary/20 border border-primary' :
                'bg-surface border border-border'}
            `}
          >
            {char}
          </div>
        ))}
      </div>

      {/* Hint button */}
      <button
        onClick={useHint}
        disabled={hints.size >= maxHints || gameOver}
        className="mb-4 px-4 py-2 bg-warning/30 border border-warning rounded-lg text-sm disabled:opacity-50"
      >
        Use Hint ({maxHints - hints.size})
      </button>

      {/* Keyboard */}
      <div className="flex flex-col gap-1">
        {alphabetRows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center gap-1">
            {row.split('').map((letter) => (
              <button
                key={letter}
                onClick={() => handleLetterInput(letter)}
                disabled={gameOver}
                className="w-8 h-10 bg-surface border border-border rounded text-sm font-bold hover:bg-surface-light"
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={score >= Math.ceil(totalRounds * 0.6) ? 'text-primary' : 'text-danger'}>
            {score >= Math.ceil(totalRounds * 0.6) ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
