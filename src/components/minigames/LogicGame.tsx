import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface LogicGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface LogicPuzzle {
  question: string;
  options: string[];
  correct: number;
}

const PUZZLES: LogicPuzzle[] = [
  {
    question: "If all roses are flowers, and some flowers fade quickly, which is true?",
    options: ["All roses fade quickly", "Some roses might fade quickly", "No roses fade quickly"],
    correct: 1,
  },
  {
    question: "A is taller than B. C is shorter than B. Who is tallest?",
    options: ["A", "B", "C"],
    correct: 0,
  },
  {
    question: "If it rains, the ground is wet. The ground is wet. What can we conclude?",
    options: ["It rained", "It might have rained", "It didn't rain"],
    correct: 1,
  },
  {
    question: "Complete: 2, 6, 12, 20, ?",
    options: ["28", "30", "32"],
    correct: 1,
  },
  {
    question: "If no heroes are cowards, and some soldiers are cowards, then:",
    options: ["No soldiers are heroes", "Some soldiers are not heroes", "All soldiers are heroes"],
    correct: 1,
  },
  {
    question: "Tom is twice as old as Sam was when Tom was Sam's age. Who is older?",
    options: ["Tom", "Sam", "Same age"],
    correct: 0,
  },
  {
    question: "Which doesn't belong: Apple, Orange, Carrot, Banana?",
    options: ["Apple", "Orange", "Carrot", "Banana"],
    correct: 2,
  },
  {
    question: "If 5 machines take 5 mins to make 5 widgets, how long for 100 machines to make 100 widgets?",
    options: ["100 mins", "5 mins", "20 mins"],
    correct: 1,
  },
];

export const LogicGame = ({ difficulty, onComplete }: LogicGameProps) => {
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [puzzles, setPuzzles] = useState<LogicPuzzle[]>([]);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const startTime = useRef(Date.now());

  const totalPuzzles = Math.floor(3 + difficulty * 2);

  // Initialize puzzles
  useEffect(() => {
    const shuffled = [...PUZZLES].sort(() => Math.random() - 0.5);
    setPuzzles(shuffled.slice(0, totalPuzzles));
  }, [totalPuzzles]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = score / totalPuzzles;
    onComplete({
      moduleId: 'logic',
      moduleType: 'logic',
      score: scoreRatio,
      passed: score >= Math.ceil(totalPuzzles * 0.6),
      timeSpent,
    });
  }, [gameOver, score, totalPuzzles, onComplete]);

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

  const handleAnswer = (answerIndex: number) => {
    if (answered || gameOver || !puzzles[currentPuzzle]) return;

    setSelectedAnswer(answerIndex);
    setAnswered(true);

    if (answerIndex === puzzles[currentPuzzle].correct) {
      setScore(s => s + 1);
    }

    // Move to next puzzle after delay
    setTimeout(() => {
      if (currentPuzzle + 1 >= puzzles.length) {
        handleGameEnd();
      } else {
        setCurrentPuzzle(p => p + 1);
        setAnswered(false);
        setSelectedAnswer(null);
      }
    }, 1000);
  };

  const puzzle = puzzles[currentPuzzle];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Score: {score}/{totalPuzzles}</span>
        <span>Q: {currentPuzzle + 1}/{puzzles.length}</span>
        <span className={timeLeft <= 15 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {puzzle && (
        <div className="w-full">
          <div className="bg-surface border border-border rounded-lg p-4 mb-4">
            <p className="text-sm leading-relaxed">{puzzle.question}</p>
          </div>

          <div className="space-y-2">
            {puzzle.options.map((option, idx) => {
              let btnClass = 'bg-surface border border-border hover:bg-surface-light';

              if (answered) {
                if (idx === puzzle.correct) {
                  btnClass = 'bg-green-500/30 border-green-500';
                } else if (idx === selectedAnswer && selectedAnswer !== puzzle.correct) {
                  btnClass = 'bg-red-500/30 border-red-500';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={answered}
                  className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${btnClass}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={score >= Math.ceil(totalPuzzles * 0.6) ? 'text-primary' : 'text-danger'}>
            {score >= Math.ceil(totalPuzzles * 0.6) ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
