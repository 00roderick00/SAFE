import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface MorseLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const MORSE_CODE: { [key: string]: string } = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

const WORDS = ['CODE', 'SAFE', 'KEY', 'LOCK', 'HACK', 'OPEN'];

export const MorseLock = ({ difficulty, onComplete }: MorseLockProps) => {
  const [word, setWord] = useState('');
  const [morseCode, setMorseCode] = useState('');
  const [userInput, setUserInput] = useState('');
  const [currentChar, setCurrentChar] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const startTime = useRef(Date.now());

  const maxAttempts = 3;

  // Initialize puzzle
  useEffect(() => {
    const selectedWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    setWord(selectedWord);

    const morse = selectedWord.split('').map(char => MORSE_CODE[char]).join(' ');
    setMorseCode(morse);
  }, []);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    onComplete({
      moduleId: 'morse',
      moduleType: 'morse',
      score: success ? 1 : currentChar / word.length,
      passed: success,
      timeSpent,
    });
  }, [gameOver, currentChar, word.length, onComplete]);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleGameEnd(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver, handleGameEnd]);

  const addSignal = (signal: '.' | '-') => {
    if (gameOver) return;
    setUserInput(prev => prev + signal);
  };

  const checkLetter = () => {
    if (gameOver || !userInput) return;

    const targetMorse = MORSE_CODE[word[currentChar]];

    if (userInput === targetMorse) {
      // Correct!
      if (currentChar + 1 >= word.length) {
        handleGameEnd(true);
      } else {
        setCurrentChar(c => c + 1);
        setUserInput('');
      }
    } else {
      // Wrong
      setAttempts((a) => {
        const newAttempts = a + 1;
        if (newAttempts >= maxAttempts) {
          handleGameEnd(false);
        }
        return newAttempts;
      });
      setUserInput('');
    }
  };

  const clearInput = () => {
    if (gameOver) return;
    setUserInput('');
  };

  // Split morse code by character for display
  const morseChars = word.split('').map(char => MORSE_CODE[char]);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Attempts: {attempts}/{maxAttempts}</span>
        <span>Letter: {currentChar + 1}/{word.length}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Morse code display */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-4 w-full">
        <p className="text-xs text-text-dim mb-2">Decode this morse code:</p>
        <div className="flex flex-wrap gap-4 justify-center">
          {morseChars.map((morse, i) => (
            <div
              key={i}
              className={`text-center ${i === currentChar ? 'text-primary' : i < currentChar ? 'text-text-dim' : ''}`}
            >
              <div className="text-2xl font-mono tracking-wider">{morse}</div>
              <div className="text-xs mt-1">
                {i < currentChar ? word[i] : i === currentChar ? '?' : '_'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current input */}
      <div className="bg-surface-light rounded-lg px-6 py-4 mb-4 min-w-[200px] text-center">
        <span className="text-3xl font-mono tracking-widest">
          {userInput || '_'}
        </span>
      </div>

      {/* Hint */}
      <button
        onClick={() => setShowHint(!showHint)}
        className="text-xs text-text-dim mb-3 underline"
      >
        {showHint ? 'Hide hint' : 'Show morse chart'}
      </button>

      {showHint && (
        <div className="bg-surface border border-border rounded-lg p-2 mb-4 text-xs grid grid-cols-4 gap-1">
          {Object.entries(MORSE_CODE).slice(0, 16).map(([letter, code]) => (
            <div key={letter} className="text-center">
              <span className="font-bold">{letter}</span>: {code}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => addSignal('.')}
          className="w-20 h-20 bg-surface border-2 border-border rounded-full text-4xl hover:bg-surface-light active:scale-95"
        >
          •
        </button>
        <button
          onClick={() => addSignal('-')}
          className="w-20 h-20 bg-surface border-2 border-border rounded-full text-4xl hover:bg-surface-light active:scale-95"
        >
          —
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={clearInput}
          className="px-6 py-3 bg-danger/30 border border-danger rounded-lg font-bold hover:bg-danger/50"
        >
          CLEAR
        </button>
        <button
          onClick={checkLetter}
          disabled={!userInput}
          className="px-6 py-3 bg-primary text-background rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
        >
          CHECK
        </button>
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={currentChar >= word.length ? 'text-primary' : 'text-danger'}>
            {currentChar >= word.length ? 'Unlocked!' : 'Locked Out!'}
          </p>
          <p className="text-sm text-text-dim">Word was: {word}</p>
        </div>
      )}
    </div>
  );
};
