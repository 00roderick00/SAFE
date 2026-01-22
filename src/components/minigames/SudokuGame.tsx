import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface SudokuGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const GRID_SIZE = 4; // Mini sudoku for quick games

export const SudokuGame = ({ difficulty, onComplete }: SudokuGameProps) => {
  const [grid, setGrid] = useState<number[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [errors, setErrors] = useState(0);
  const [filled, setFilled] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(40);
  const startTime = useRef(Date.now());

  const blanks = Math.floor(6 + difficulty * 4); // Number of cells to fill
  const maxErrors = 3;

  // Generate a valid mini sudoku
  useEffect(() => {
    const base = [
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1],
    ];

    // Shuffle rows within bands and columns within stacks
    const shuffled = base.map(row => [...row]);

    // Swap some rows
    if (Math.random() > 0.5) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    if (Math.random() > 0.5) {
      [shuffled[2], shuffled[3]] = [shuffled[3], shuffled[2]];
    }

    setSolution(shuffled);

    // Create puzzle by removing cells
    const puzzle = shuffled.map(row => [...row]);
    const positions: { row: number; col: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        positions.push({ row: r, col: c });
      }
    }

    // Shuffle and remove cells
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < blanks; i++) {
      const { row, col } = positions[i];
      puzzle[row][col] = 0;
    }

    setGrid(puzzle);
  }, [blanks]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, filled / blanks);
    onComplete({
      moduleId: 'sudoku',
      moduleType: 'sudoku',
      score: scoreRatio,
      passed: filled >= blanks && errors < maxErrors,
      timeSpent,
    });
  }, [gameOver, filled, blanks, errors, onComplete]);

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

  const handleCellClick = (row: number, col: number) => {
    if (gameOver || solution[row]?.[col] === grid[row]?.[col]) return;
    setSelected({ row, col });
  };

  const handleNumberInput = (num: number) => {
    if (!selected || gameOver) return;
    const { row, col } = selected;

    if (num === solution[row][col]) {
      setGrid((g) => {
        const newGrid = g.map(r => [...r]);
        newGrid[row][col] = num;
        return newGrid;
      });
      setFilled((f) => {
        const newFilled = f + 1;
        if (newFilled >= blanks) handleGameEnd();
        return newFilled;
      });
      setSelected(null);
    } else {
      setErrors((e) => {
        const newErrors = e + 1;
        if (newErrors >= maxErrors) handleGameEnd();
        return newErrors;
      });
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Filled: {filled}/{blanks}</span>
        <span className="text-danger">Errors: {errors}/{maxErrors}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Sudoku grid */}
      <div className="grid grid-cols-4 gap-0.5 bg-border p-0.5 rounded-lg">
        {grid.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            const isSelected = selected?.row === rowIdx && selected?.col === colIdx;
            const isGiven = solution[rowIdx]?.[colIdx] === grid[rowIdx]?.[colIdx] && cell !== 0;
            const isEmpty = cell === 0;

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                onClick={() => handleCellClick(rowIdx, colIdx)}
                className={`w-14 h-14 flex items-center justify-center text-2xl font-bold
                  ${isSelected ? 'bg-primary/30' : 'bg-surface'}
                  ${isEmpty ? 'cursor-pointer' : 'cursor-default'}
                  ${(rowIdx === 1 || rowIdx === 3) ? 'border-t-2 border-border' : ''}
                  ${(colIdx === 1 || colIdx === 3) ? 'border-l-2 border-border' : ''}
                `}
              >
                {cell !== 0 && (
                  <span className={isGiven ? 'text-text-dim' : 'text-primary'}>
                    {cell}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Number input */}
      <div className="flex gap-2 mt-4">
        {[1, 2, 3, 4].map((num) => (
          <button
            key={num}
            onClick={() => handleNumberInput(num)}
            className="w-12 h-12 bg-surface border border-border rounded-lg text-xl font-bold hover:bg-surface-light"
          >
            {num}
          </button>
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={filled >= blanks && errors < maxErrors ? 'text-primary' : 'text-danger'}>
            {filled >= blanks && errors < maxErrors ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
