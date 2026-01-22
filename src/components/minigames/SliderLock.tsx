import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface SliderLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

export const SliderLock = ({ difficulty, onComplete }: SliderLockProps) => {
  const [tiles, setTiles] = useState<number[]>([]);
  const [emptyIndex, setEmptyIndex] = useState(8);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const startTime = useRef(Date.now());

  const gridSize = 3;
  const totalTiles = gridSize * gridSize;

  // Initialize and shuffle puzzle
  useEffect(() => {
    const solution = Array.from({ length: totalTiles - 1 }, (_, i) => i + 1);
    solution.push(0); // Empty tile

    // Shuffle with valid moves
    let shuffled = [...solution];
    let empty = totalTiles - 1;

    const shuffleMoves = Math.floor(30 + difficulty * 30);
    for (let i = 0; i < shuffleMoves; i++) {
      const neighbors = getNeighbors(empty);
      const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
      [shuffled[empty], shuffled[randomNeighbor]] = [shuffled[randomNeighbor], shuffled[empty]];
      empty = randomNeighbor;
    }

    setTiles(shuffled);
    setEmptyIndex(empty);
  }, [difficulty, totalTiles]);

  const getNeighbors = (index: number): number[] => {
    const neighbors = [];
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;

    if (row > 0) neighbors.push(index - gridSize); // Up
    if (row < gridSize - 1) neighbors.push(index + gridSize); // Down
    if (col > 0) neighbors.push(index - 1); // Left
    if (col < gridSize - 1) neighbors.push(index + 1); // Right

    return neighbors;
  };

  const checkWin = useCallback((currentTiles: number[]): boolean => {
    for (let i = 0; i < totalTiles - 1; i++) {
      if (currentTiles[i] !== i + 1) return false;
    }
    return currentTiles[totalTiles - 1] === 0;
  }, [totalTiles]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    setWon(success);
    const timeSpent = Date.now() - startTime.current;
    const timeBonus = success ? Math.max(0, timeLeft) / 45 : 0;
    onComplete({
      moduleId: 'slider',
      moduleType: 'slider',
      score: success ? 0.5 + timeBonus * 0.5 : 0,
      passed: success,
      timeSpent,
    });
  }, [gameOver, timeLeft, onComplete]);

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

  const handleTileClick = (index: number) => {
    if (gameOver || tiles[index] === 0) return;

    const neighbors = getNeighbors(emptyIndex);
    if (!neighbors.includes(index)) return;

    // Swap tiles
    const newTiles = [...tiles];
    [newTiles[emptyIndex], newTiles[index]] = [newTiles[index], newTiles[emptyIndex]];
    setTiles(newTiles);
    setEmptyIndex(index);
    setMoves(m => m + 1);

    // Check win
    if (checkWin(newTiles)) {
      handleGameEnd(true);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Moves: {moves}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Arrange tiles 1-8 in order</p>

      {/* Puzzle grid */}
      <div className="grid grid-cols-3 gap-1 bg-border p-1 rounded-lg">
        {tiles.map((tile, index) => (
          <button
            key={index}
            onClick={() => handleTileClick(index)}
            disabled={tile === 0 || gameOver}
            className={`w-20 h-20 rounded-lg text-2xl font-bold transition-all
              ${tile === 0
                ? 'bg-surface-light'
                : tile === index + 1
                  ? 'bg-primary/30 border-2 border-primary'
                  : 'bg-surface border border-border hover:bg-surface-light active:scale-95'}
            `}
          >
            {tile !== 0 && tile}
          </button>
        ))}
      </div>

      {/* Target preview */}
      <div className="mt-4">
        <p className="text-xs text-text-dim mb-1 text-center">Target:</p>
        <div className="grid grid-cols-3 gap-0.5 scale-50 origin-top">
          {[1, 2, 3, 4, 5, 6, 7, 8, 0].map((n, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold
                ${n === 0 ? 'bg-transparent' : 'bg-primary/30 border border-primary'}
              `}
            >
              {n !== 0 && n}
            </div>
          ))}
        </div>
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={won ? 'text-primary' : 'text-danger'}>
            {won ? 'Unlocked!' : 'Time Up!'}
          </p>
        </div>
      )}
    </div>
  );
};
