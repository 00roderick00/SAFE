import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { MiniGameResult } from '../../types';

interface SnakeGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Position {
  x: number;
  y: number;
}

const GRID_SIZE = 12;
const CELL_SIZE = 22;

export const SnakeGame = ({ difficulty, onComplete }: SnakeGameProps) => {
  const [snake, setSnake] = useState<Position[]>([{ x: 6, y: 6 }]);
  const [food, setFood] = useState<Position>({ x: 3, y: 3 });
  const [direction, setDirection] = useState<'up' | 'down' | 'left' | 'right'>('right');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [gameStarted, setGameStarted] = useState(false);
  const startTime = useRef(Date.now());
  const directionRef = useRef(direction);
  const targetScore = Math.floor(3 + difficulty * 5);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  const spawnFood = useCallback(() => {
    let newFood: Position;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (snake.some(s => s.x === newFood.x && s.y === newFood.y));
    setFood(newFood);
  }, [snake]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, score / targetScore);
    onComplete({
      moduleId: 'snake',
      moduleType: 'snake',
      score: scoreRatio,
      passed: score >= targetScore,
      timeSpent,
    });
  }, [gameOver, score, targetScore, onComplete]);

  // Timer
  useEffect(() => {
    if (gameOver || !gameStarted) return;
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
  }, [gameOver, gameStarted, handleGameEnd]);

  // Game loop
  useEffect(() => {
    if (gameOver || !gameStarted) return;
    const speed = 180 - difficulty * 70;
    const interval = setInterval(() => {
      setSnake((currentSnake) => {
        const head = { ...currentSnake[0] };

        switch (directionRef.current) {
          case 'up': head.y -= 1; break;
          case 'down': head.y += 1; break;
          case 'left': head.x -= 1; break;
          case 'right': head.x += 1; break;
        }

        // Wall collision
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          handleGameEnd();
          return currentSnake;
        }

        // Self collision
        if (currentSnake.some(s => s.x === head.x && s.y === head.y)) {
          handleGameEnd();
          return currentSnake;
        }

        const newSnake = [head, ...currentSnake];

        // Eat food
        if (head.x === food.x && head.y === food.y) {
          setScore(s => s + 1);
          spawnFood();
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    }, speed);
    return () => clearInterval(interval);
  }, [gameOver, gameStarted, food, difficulty, handleGameEnd, spawnFood]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      if (!gameStarted) {
        setGameStarted(true);
        startTime.current = Date.now();
      }
      switch (e.key) {
        case 'ArrowUp': if (directionRef.current !== 'down') setDirection('up'); break;
        case 'ArrowDown': if (directionRef.current !== 'up') setDirection('down'); break;
        case 'ArrowLeft': if (directionRef.current !== 'right') setDirection('left'); break;
        case 'ArrowRight': if (directionRef.current !== 'left') setDirection('right'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, gameStarted]);

  // Touch controls
  const handleTouch = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return;
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
    if (dir === 'up' && directionRef.current !== 'down') setDirection('up');
    if (dir === 'down' && directionRef.current !== 'up') setDirection('down');
    if (dir === 'left' && directionRef.current !== 'right') setDirection('left');
    if (dir === 'right' && directionRef.current !== 'left') setDirection('right');
  };

  return (
    <div className="flex flex-col items-center">
      {/* Game Title */}
      <h3 className="text-lg font-bold text-primary mb-2">SNAKE</h3>

      {/* Status bar */}
      <div className="flex justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Score:</span>
          <span className={`font-mono font-bold ${score >= targetScore ? 'text-primary' : 'text-white'}`}>
            {score}/{targetScore}
          </span>
        </div>
        <div className={`font-mono font-bold ${timeLeft <= 5 ? 'text-danger animate-pulse' : 'text-text-dim'}`}>
          {timeLeft}s
        </div>
      </div>

      {/* Game board */}
      <div
        className="relative rounded-lg overflow-hidden border-2 border-border"
        style={{
          width: GRID_SIZE * CELL_SIZE,
          height: GRID_SIZE * CELL_SIZE,
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
        }}
      >
        {/* Grid lines */}
        {[...Array(GRID_SIZE - 1)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute bg-border/20"
            style={{
              left: (i + 1) * CELL_SIZE,
              top: 0,
              width: 1,
              height: GRID_SIZE * CELL_SIZE
            }}
          />
        ))}
        {[...Array(GRID_SIZE - 1)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute bg-border/20"
            style={{
              left: 0,
              top: (i + 1) * CELL_SIZE,
              width: GRID_SIZE * CELL_SIZE,
              height: 1
            }}
          />
        ))}

        {/* Food */}
        <motion.div
          className="absolute rounded-full"
          style={{
            left: food.x * CELL_SIZE + 3,
            top: food.y * CELL_SIZE + 3,
            width: CELL_SIZE - 6,
            height: CELL_SIZE - 6,
            background: 'radial-gradient(circle at 30% 30%, #ff6b6b, #ff4444)',
            boxShadow: '0 0 10px #ff444488'
          }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />

        {/* Snake */}
        {snake.map((segment, i) => (
          <motion.div
            key={i}
            className="absolute rounded-sm"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              left: segment.x * CELL_SIZE + 2,
              top: segment.y * CELL_SIZE + 2,
              width: CELL_SIZE - 4,
              height: CELL_SIZE - 4,
              background: i === 0
                ? 'linear-gradient(135deg, #00ff88, #00d67a)'
                : `rgba(0, 214, 122, ${1 - (i / snake.length) * 0.5})`,
              boxShadow: i === 0 ? '0 0 8px #00d67a88' : 'none'
            }}
          />
        ))}

        {/* Start message */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white text-sm font-medium">Tap to Start</p>
          </div>
        )}
      </div>

      {/* Touch controls */}
      <div className="grid grid-cols-3 gap-2 mt-4" style={{ width: 150 }}>
        <div />
        <motion.button
          onClick={() => handleTouch('up')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowUp size={20} className="text-primary" />
        </motion.button>
        <div />
        <motion.button
          onClick={() => handleTouch('left')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft size={20} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={() => handleTouch('down')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowDown size={20} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={() => handleTouch('right')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowRight size={20} className="text-primary" />
        </motion.button>
      </div>

      {/* Game over message */}
      {gameOver && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-center"
        >
          <p className={`text-lg font-bold ${score >= targetScore ? 'text-primary' : 'text-danger'}`}>
            {score >= targetScore ? 'LOCK CRACKED!' : 'FAILED'}
          </p>
        </motion.div>
      )}
    </div>
  );
};
