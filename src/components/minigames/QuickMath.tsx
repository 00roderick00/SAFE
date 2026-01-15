import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface QuickMathProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Problem {
  question: string;
  answer: number;
  options: number[];
}

export const QuickMath = ({ difficulty, onComplete }: QuickMathProps) => {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [score, setScore] = useState(0);
  const [totalProblems, setTotalProblems] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const startTime = useRef(Date.now());

  const generateProblem = useCallback(() => {
    const maxNum = 5 + Math.floor(difficulty * 15);
    const operations = difficulty > 0.5 ? ['+', '-', '*'] : ['+', '-'];
    const op = operations[Math.floor(Math.random() * operations.length)];

    let a: number, b: number, answer: number;

    switch (op) {
      case '+':
        a = Math.floor(Math.random() * maxNum) + 1;
        b = Math.floor(Math.random() * maxNum) + 1;
        answer = a + b;
        break;
      case '-':
        a = Math.floor(Math.random() * maxNum) + 5;
        b = Math.floor(Math.random() * Math.min(a, maxNum)) + 1;
        answer = a - b;
        break;
      case '*':
        a = Math.floor(Math.random() * 10) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a * b;
        break;
      default:
        a = 1;
        b = 1;
        answer = 2;
    }

    // Generate wrong options
    const wrongOptions = new Set<number>();
    while (wrongOptions.size < 3) {
      const wrong = answer + Math.floor(Math.random() * 10) - 5;
      if (wrong !== answer && wrong > 0) {
        wrongOptions.add(wrong);
      }
    }

    const options = [answer, ...Array.from(wrongOptions)]
      .sort(() => Math.random() - 0.5);

    setProblem({
      question: `${a} ${op} ${b} = ?`,
      answer,
      options,
    });
    setTotalProblems((t) => t + 1);
  }, [difficulty]);

  // Initialize first problem
  useEffect(() => {
    generateProblem();
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
    const accuracy = totalProblems > 0 ? score / totalProblems : 0;

    onComplete({
      moduleId: 'quickmath',
      moduleType: 'quickmath',
      score: accuracy,
      passed: accuracy >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalProblems, onComplete]);

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
      generateProblem();
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
