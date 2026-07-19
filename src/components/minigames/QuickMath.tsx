import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MiniGameProps } from '../../types';

interface Problem {
  question: string;
  answer: number;
  options: number[];
}

interface QuickMathConfig {
  problemCount?: number;
  operations?: string[];
  timeLimit?: number;
  allowNegatives?: boolean;
}

const OP_MAP: Record<string, '+' | '-' | '*' | '/'> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
};

function createProblem(
  difficulty: number,
  allowedOps: ('+' | '-' | '*' | '/')[],
  allowNegatives: boolean,
): Problem {
  const maxNum = 5 + Math.floor(difficulty * 15);
  const op = allowedOps[Math.floor(Math.random() * allowedOps.length)];
  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case '+':
      a = Math.floor(Math.random() * maxNum) + 1;
      b = Math.floor(Math.random() * maxNum) + 1;
      answer = a + b;
      break;
    case '-':
      if (allowNegatives) {
        a = Math.floor(Math.random() * maxNum) + 1;
        b = Math.floor(Math.random() * maxNum) + 1;
      } else {
        a = Math.floor(Math.random() * maxNum) + 5;
        b = Math.floor(Math.random() * Math.min(a, maxNum)) + 1;
      }
      answer = a - b;
      break;
    case '*':
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 10) + 1;
      answer = a * b;
      break;
    case '/':
      b = Math.floor(Math.random() * 9) + 2;
      answer = Math.floor(Math.random() * 10) + 1;
      a = b * answer;
      break;
    default:
      a = 1;
      b = 1;
      answer = 2;
  }

  const wrongOptions = new Set<number>();
  while (wrongOptions.size < 3) {
    const wrong = answer + Math.floor(Math.random() * 10) - 5;
    if (wrong !== answer && (allowNegatives || wrong > 0)) wrongOptions.add(wrong);
  }

  return {
    question: `${a} ${op} ${b} = ?`,
    answer,
    options: [answer, ...wrongOptions].sort(() => Math.random() - 0.5),
  };
}

export const QuickMath = ({ difficulty, config, onComplete }: MiniGameProps) => {
  const cfg = (config ?? {}) as QuickMathConfig;
  const targetCount = cfg.problemCount;
  const allowedOps = useMemo(() => {
    if (Array.isArray(cfg.operations) && cfg.operations.length > 0) {
      const mapped = cfg.operations
        .map((op) => OP_MAP[op])
        .filter((v): v is '+' | '-' | '*' | '/' => Boolean(v));
      if (mapped.length > 0) return mapped;
    }
    return (difficulty > 0.5 ? ['+', '-', '*'] : ['+', '-']) as ('+' | '-' | '*' | '/')[];
  }, [cfg.operations, difficulty]);

  const [problem, setProblem] = useState<Problem>(() => createProblem(
    difficulty,
    allowedOps,
    cfg.allowNegatives === true,
  ));
  const [score, setScore] = useState(0);
  const [totalProblems, setTotalProblems] = useState(1);
  const [timeLeft, setTimeLeft] = useState(cfg.timeLimit ?? 20);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const startTime = useRef<number>(0);
  useEffect(() => { startTime.current = Date.now(); }, []);

  const generateProblem = useCallback(() => {
    setProblem(createProblem(difficulty, allowedOps, cfg.allowNegatives === true));
    setTotalProblems((t) => t + 1);
  }, [allowedOps, cfg.allowNegatives, difficulty]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const accuracy = totalProblems > 0 ? score / totalProblems : 0;

    onComplete({
      moduleId: 'quickmath',
      moduleType: 'quickmath',
      score: accuracy,
      passed: accuracy >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalProblems, onComplete]);

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

  const handleAnswer = (selectedAnswer: number) => {
    if (gameOver || !problem) return;

    if (selectedAnswer === problem.answer) {
      setScore((s) => s + 1);
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }

    setTimeout(() => {
      setFeedback(null);
      // Custom variants can cap the game at `problemCount` problems;
      // otherwise it runs until the timer expires.
      if (typeof targetCount === 'number' && totalProblems + 1 >= targetCount) {
        handleGameEnd();
      } else {
        generateProblem();
      }
    }, 300);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-4 px-2">
        <span className="text-primary font-display">Score: {score}/{totalProblems}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Problem Display */}
      <motion.div
        className={`w-full max-w-xs p-6 rounded-xl text-center mb-6 ${
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
        <span className="font-display text-4xl font-bold text-text">
          {problem?.question}
        </span>
      </motion.div>

      {/* Answer Options */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {problem?.options.map((option, index) => (
          <motion.button
            key={index}
            className="p-4 bg-surface-light rounded-xl font-display text-2xl font-bold text-text hover:bg-primary/20 active:bg-primary active:text-background transition-colors"
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAnswer(option)}
          >
            {option}
          </motion.button>
        ))}
      </div>

      <p className="mt-4 text-sm text-text-dim">Solve as many as you can!</p>
    </div>
  );
};
