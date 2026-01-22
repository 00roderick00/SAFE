import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface SpotDiffGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface GridItem {
  emoji: string;
  isDifferent: boolean;
  found: boolean;
}

const EMOJIS = ['🔵', '🟢', '🟡', '🟠', '🔴', '🟣', '⚪', '⬛'];

export const SpotDiffGame = ({ difficulty, onComplete }: SpotDiffGameProps) => {
  const [leftGrid, setLeftGrid] = useState<GridItem[][]>([]);
  const [rightGrid, setRightGrid] = useState<GridItem[][]>([]);
  const [found, setFound] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(35);
  const startTime = useRef(Date.now());

  const gridSize = 4;
  const differences = Math.floor(3 + difficulty * 2);
  const maxMistakes = 5;

  // Initialize grids
  useEffect(() => {
    const baseGrid: GridItem[][] = [];

    // Create base grid
    for (let r = 0; r < gridSize; r++) {
      baseGrid[r] = [];
      for (let c = 0; c < gridSize; c++) {
        baseGrid[r][c] = {
          emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
          isDifferent: false,
          found: false,
        };
      }
    }

    // Select positions for differences
    const positions: { r: number; c: number }[] = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        positions.push({ r, c });
      }
    }

    // Shuffle and pick difference positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    const diffPositions = positions.slice(0, differences);

    // Create right grid with differences
    const rightGridCopy: GridItem[][] = baseGrid.map(row =>
      row.map(item => ({ ...item }))
    );

    for (const { r, c } of diffPositions) {
      let newEmoji;
      do {
        newEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      } while (newEmoji === baseGrid[r][c].emoji);

      rightGridCopy[r][c].emoji = newEmoji;
      rightGridCopy[r][c].isDifferent = true;
      baseGrid[r][c].isDifferent = true;
    }

    setLeftGrid(baseGrid);
    setRightGrid(rightGridCopy);
  }, [differences, gridSize]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = found / differences;
    onComplete({
      moduleId: 'spotdiff',
      moduleType: 'spotdiff',
      score: scoreRatio,
      passed: found >= differences,
      timeSpent,
    });
  }, [gameOver, found, differences, onComplete]);

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

  const handleClick = (row: number, col: number) => {
    if (gameOver) return;

    const leftItem = leftGrid[row]?.[col];
    const rightItem = rightGrid[row]?.[col];

    if (!leftItem || !rightItem || leftItem.found) return;

    if (leftItem.isDifferent) {
      // Found a difference!
      setLeftGrid((g) => {
        const newGrid = g.map(r => r.map(i => ({ ...i })));
        newGrid[row][col].found = true;
        return newGrid;
      });
      setRightGrid((g) => {
        const newGrid = g.map(r => r.map(i => ({ ...i })));
        newGrid[row][col].found = true;
        return newGrid;
      });
      setFound((f) => {
        const newFound = f + 1;
        if (newFound >= differences) handleGameEnd();
        return newFound;
      });
    } else {
      // Mistake
      setMistakes((m) => {
        const newMistakes = m + 1;
        if (newMistakes >= maxMistakes) handleGameEnd();
        return newMistakes;
      });
    }
  };

  const renderGrid = (grid: GridItem[][], isRight: boolean) => (
    <div className="grid grid-cols-4 gap-1 bg-border p-1 rounded-lg">
      {grid.map((row, rowIdx) =>
        row.map((item, colIdx) => (
          <button
            key={`${isRight ? 'r' : 'l'}-${rowIdx}-${colIdx}`}
            onClick={() => handleClick(rowIdx, colIdx)}
            className={`w-10 h-10 flex items-center justify-center rounded text-xl
              ${item.found ? 'bg-primary/30 ring-2 ring-primary' : 'bg-surface hover:bg-surface-light'}
            `}
          >
            {item.emoji}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Found: {found}/{differences}</span>
        <span className="text-danger">X: {mistakes}/{maxMistakes}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Find the differences between the grids</p>

      <div className="flex gap-4">
        {renderGrid(leftGrid, false)}
        {renderGrid(rightGrid, true)}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={found >= differences ? 'text-primary' : 'text-danger'}>
            {found >= differences ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
