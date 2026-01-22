import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowDown, RotateCw } from 'lucide-react';
import { MiniGameResult } from '../../types';

interface TetrisGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;
const CELL_SIZE = 16;

const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[0, 1, 1], [1, 1, 0]], // S
  [[1, 1, 0], [0, 1, 1]], // Z
];

const COLORS = [
  { main: '#00d4ff', glow: '#00d4ff44' }, // I - Cyan
  { main: '#ffff00', glow: '#ffff0044' }, // O - Yellow
  { main: '#a000ff', glow: '#a000ff44' }, // T - Purple
  { main: '#ff8000', glow: '#ff800044' }, // L - Orange
  { main: '#0066ff', glow: '#0066ff44' }, // J - Blue
  { main: '#00ff44', glow: '#00ff4444' }, // S - Green
  { main: '#ff0044', glow: '#ff004444' }, // Z - Red
];

export const TetrisGame = ({ difficulty, onComplete }: TetrisGameProps) => {
  const [board, setBoard] = useState<number[][]>([]);
  const [piece, setPiece] = useState<{ shape: number[][]; x: number; y: number; color: number } | null>(null);
  const [score, setScore] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(50);
  const [gameStarted, setGameStarted] = useState(false);
  const startTime = useRef(Date.now());
  const targetLines = Math.floor(2 + difficulty * 4);

  // Initialize board
  useEffect(() => {
    const newBoard: number[][] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      newBoard[y] = new Array(BOARD_WIDTH).fill(0);
    }
    setBoard(newBoard);
    spawnPiece();
  }, []);

  const spawnPiece = useCallback(() => {
    const shapeIndex = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[shapeIndex];
    setPiece({
      shape,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(shape[0].length / 2),
      y: 0,
      color: shapeIndex + 1,
    });
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
  }, [gameStarted]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, linesCleared / targetLines);
    onComplete({
      moduleId: 'tetris',
      moduleType: 'tetris',
      score: scoreRatio,
      passed: linesCleared >= targetLines,
      timeSpent,
    });
  }, [gameOver, linesCleared, targetLines, onComplete]);

  const checkCollision = useCallback((shape: number[][], x: number, y: number, currentBoard: number[][]) => {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const newX = x + col;
          const newY = y + row;
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) return true;
          if (newY >= 0 && currentBoard[newY]?.[newX]) return true;
        }
      }
    }
    return false;
  }, []);

  const mergePiece = useCallback(() => {
    if (!piece) return;
    setBoard((currentBoard) => {
      const newBoard = currentBoard.map(row => [...row]);
      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col]) {
            const y = piece.y + row;
            const x = piece.x + col;
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
              newBoard[y][x] = piece.color;
            }
          }
        }
      }

      // Check for completed lines
      let cleared = 0;
      for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        if (newBoard[y].every(cell => cell !== 0)) {
          newBoard.splice(y, 1);
          newBoard.unshift(new Array(BOARD_WIDTH).fill(0));
          cleared++;
          y++;
        }
      }
      if (cleared > 0) {
        setLinesCleared(l => l + cleared);
        setScore(s => s + cleared * 100);
      }

      return newBoard;
    });

    // Check if new piece can spawn
    const shapeIndex = Math.floor(Math.random() * SHAPES.length);
    const newShape = SHAPES[shapeIndex];
    const newX = Math.floor(BOARD_WIDTH / 2) - Math.floor(newShape[0].length / 2);

    setTimeout(() => {
      setBoard((currentBoard) => {
        if (checkCollision(newShape, newX, 0, currentBoard)) {
          handleGameEnd();
          return currentBoard;
        }
        setPiece({ shape: newShape, x: newX, y: 0, color: shapeIndex + 1 });
        return currentBoard;
      });
    }, 0);
  }, [piece, checkCollision, handleGameEnd]);

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

  // Game loop - drop piece
  useEffect(() => {
    if (gameOver || !piece || !gameStarted) return;
    const speed = 700 - difficulty * 350;
    const interval = setInterval(() => {
      setPiece((p) => {
        if (!p) return p;
        if (checkCollision(p.shape, p.x, p.y + 1, board)) {
          mergePiece();
          return p;
        }
        return { ...p, y: p.y + 1 };
      });
    }, speed);
    return () => clearInterval(interval);
  }, [gameOver, piece, board, difficulty, checkCollision, mergePiece, gameStarted]);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver || !piece) return;

      setPiece((p) => {
        if (!p) return p;

        if (e.key === 'ArrowLeft' && !checkCollision(p.shape, p.x - 1, p.y, board)) {
          return { ...p, x: p.x - 1 };
        }
        if (e.key === 'ArrowRight' && !checkCollision(p.shape, p.x + 1, p.y, board)) {
          return { ...p, x: p.x + 1 };
        }
        if (e.key === 'ArrowDown' && !checkCollision(p.shape, p.x, p.y + 1, board)) {
          return { ...p, y: p.y + 1 };
        }
        if (e.key === 'ArrowUp') {
          const rotated = p.shape[0].map((_, i) => p.shape.map(row => row[i]).reverse());
          if (!checkCollision(rotated, p.x, p.y, board)) {
            return { ...p, shape: rotated };
          }
        }
        return p;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, piece, board, checkCollision]);

  const move = (dir: 'left' | 'right' | 'down' | 'rotate') => {
    if (gameOver || !piece) return;
    setPiece((p) => {
      if (!p) return p;
      if (dir === 'left' && !checkCollision(p.shape, p.x - 1, p.y, board)) return { ...p, x: p.x - 1 };
      if (dir === 'right' && !checkCollision(p.shape, p.x + 1, p.y, board)) return { ...p, x: p.x + 1 };
      if (dir === 'down' && !checkCollision(p.shape, p.x, p.y + 1, board)) return { ...p, y: p.y + 1 };
      if (dir === 'rotate') {
        const rotated = p.shape[0].map((_, i) => p.shape.map(row => row[i]).reverse());
        if (!checkCollision(rotated, p.x, p.y, board)) return { ...p, shape: rotated };
      }
      return p;
    });
  };

  return (
    <div className="flex flex-col items-center">
      {/* Game Title */}
      <h3 className="text-lg font-bold text-primary mb-2">TETRIS</h3>

      {/* Status bar */}
      <div className="flex justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Lines:</span>
          <span className={`font-mono font-bold ${linesCleared >= targetLines ? 'text-primary' : 'text-white'}`}>
            {linesCleared}/{targetLines}
          </span>
        </div>
        <div className={`font-mono font-bold ${timeLeft <= 10 ? 'text-danger animate-pulse' : 'text-text-dim'}`}>
          {timeLeft}s
        </div>
      </div>

      {/* Game board */}
      <div
        className="relative rounded-lg overflow-hidden border-2 border-border"
        style={{
          width: BOARD_WIDTH * CELL_SIZE,
          height: BOARD_HEIGHT * CELL_SIZE,
          background: 'linear-gradient(180deg, #0a0a0a 0%, #151515 100%)'
        }}
      >
        {/* Grid lines */}
        {[...Array(BOARD_WIDTH - 1)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute bg-border/10"
            style={{
              left: (i + 1) * CELL_SIZE,
              top: 0,
              width: 1,
              height: BOARD_HEIGHT * CELL_SIZE
            }}
          />
        ))}

        {/* Board cells */}
        {board.map((row, y) =>
          row.map((cell, x) =>
            cell ? (
              <div
                key={`${x}-${y}`}
                className="absolute rounded-sm"
                style={{
                  left: x * CELL_SIZE + 1,
                  top: y * CELL_SIZE + 1,
                  width: CELL_SIZE - 2,
                  height: CELL_SIZE - 2,
                  backgroundColor: COLORS[cell - 1].main,
                  boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.3), inset -1px -1px 2px rgba(0,0,0,0.3), 0 0 4px ${COLORS[cell - 1].glow}`,
                }}
              />
            ) : null
          )
        )}

        {/* Current piece */}
        {piece && piece.shape.map((row, py) =>
          row.map((cell, px) =>
            cell ? (
              <motion.div
                key={`piece-${px}-${py}`}
                className="absolute rounded-sm"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                  left: (piece.x + px) * CELL_SIZE + 1,
                  top: (piece.y + py) * CELL_SIZE + 1,
                  width: CELL_SIZE - 2,
                  height: CELL_SIZE - 2,
                  backgroundColor: COLORS[piece.color - 1].main,
                  boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.3), inset -1px -1px 2px rgba(0,0,0,0.3), 0 0 6px ${COLORS[piece.color - 1].glow}`,
                }}
              />
            ) : null
          )
        )}
      </div>

      {/* Touch controls */}
      <div className="flex gap-3 mt-4">
        <motion.button
          onClick={() => move('left')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft size={20} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={() => move('rotate')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <RotateCw size={20} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={() => move('down')}
          className="p-3 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowDown size={20} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={() => move('right')}
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
          <p className={`text-lg font-bold ${linesCleared >= targetLines ? 'text-primary' : 'text-danger'}`}>
            {linesCleared >= targetLines ? 'LOCK CRACKED!' : 'FAILED'}
          </p>
        </motion.div>
      )}
    </div>
  );
};
