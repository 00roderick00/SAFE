import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface NumSequenceGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Sequence {
  numbers: number[];
  answer: number;
  pattern: string;
}

const generateSequence = (diff: number): Sequence => {
  const patterns = [
    // Arithmetic sequences
    () => {
      const start = Math.floor(Math.random() * 10) + 1;
      const step = Math.floor(Math.random() * 5) + 2;
      const nums = [start, start + step, start + 2 * step, start + 3 * step];
      return { numbers: nums, answer: start + 4 * step, pattern: `+${step}` };
    },
    // Geometric (multiply)
    () => {
      const start = Math.floor(Math.random() * 3) + 2;
      const mult = 2;
      const nums = [start, start * mult, start * mult * mult, start * mult * mult * mult];
      return { numbers: nums, answer: nums[3] * mult, pattern: `x${mult}` };
    },
    // Square numbers
    () => {
      const offset = Math.floor(Math.random() * 3);
      const nums = [(1 + offset) ** 2, (2 + offset) ** 2, (3 + offset) ** 2, (4 + offset) ** 2];
      return { numbers: nums, answer: (5 + offset) ** 2, pattern: 'squares' };
    },
    // Fibonacci-like
    () => {
      const a = Math.floor(Math.random() * 3) + 1;
      const b = Math.floor(Math.random() * 3) + 2;
      const nums = [a, b, a + b, b + (a + b)];
      return { numbers: nums, answer: (a + b) + (b + (a + b)), pattern: 'fib' };
    },
    // Alternating
    () => {
      const start = Math.floor(Math.random() * 5) + 5;
      const step1 = Math.floor(Math.random() * 3) + 2;
      const step2 = Math.floor(Math.random() * 3) + 3;
      const nums = [start, start + step1, start + step1 + step2, start + step1 + step2 + step1];
      return { numbers: nums, answer: nums[3] + step2, pattern: `alt +${step1}/+${step2}` };
    },
  ];

  // Higher difficulty = more complex patterns
  const availablePatterns = patterns.slice(0, Math.min(patterns.length, 2 + Math.floor(diff * 3)));
  const pattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
  return pattern();
};

export const NumSequenceGame = ({ difficulty, onComplete }: NumSequenceGameProps) => {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const startTime = useRef(Date.now());

  const totalRounds = Math.floor(3 + difficulty * 2);

  useEffect(() => {
    setSequence(generateSequence(difficulty));
  }, [difficulty]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = score / totalRounds;
    onComplete({
      moduleId: 'numsequence',
      moduleType: 'numsequence',
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

  const handleSubmit = () => {
    if (!sequence || gameOver || !input) return;

    const userAnswer = parseInt(input, 10);
    const isCorrect = userAnswer === sequence.answer;

    setFeedback(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      setScore(s => s + 1);
    }

    setTimeout(() => {
      if (currentRound + 1 >= totalRounds) {
        handleGameEnd();
      } else {
        setCurrentRound(r => r + 1);
        setSequence(generateSequence(difficulty));
        setInput('');
        setFeedback(null);
      }
    }, 1000);
  };

  const handleNumberClick = (num: string) => {
    if (feedback || gameOver) return;
    if (num === 'C') {
      setInput('');
    } else if (num === 'OK') {
      handleSubmit();
    } else {
      setInput(input + num);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Score: {score}/{totalRounds}</span>
        <span>Round: {currentRound + 1}/{totalRounds}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Find the next number in the sequence</p>

      {/* Sequence display */}
      {sequence && (
        <div className="flex items-center gap-2 mb-4">
          {sequence.numbers.map((num, i) => (
            <div
              key={i}
              className="w-14 h-14 bg-surface border border-border rounded-lg flex items-center justify-center text-xl font-bold"
            >
              {num}
            </div>
          ))}
          <div
            className={`w-14 h-14 rounded-lg flex items-center justify-center text-xl font-bold
              ${feedback === 'correct' ? 'bg-primary/30 border-2 border-primary' :
                feedback === 'wrong' ? 'bg-danger/30 border-2 border-danger' :
                'bg-surface-light border-2 border-primary'}`}
          >
            {feedback === 'wrong' ? sequence.answer : (input || '?')}
          </div>
        </div>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2 w-48">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((key) => (
          <button
            key={key}
            onClick={() => handleNumberClick(key)}
            disabled={feedback !== null || gameOver}
            className={`p-3 rounded-lg text-lg font-bold
              ${key === 'OK' ? 'bg-primary text-background' :
                key === 'C' ? 'bg-danger/30' :
                'bg-surface border border-border hover:bg-surface-light'}
            `}
          >
            {key}
          </button>
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
