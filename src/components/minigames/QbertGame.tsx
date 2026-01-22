import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface QbertGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Position {
  row: number;
  col: number;
}

const PYRAMID_ROWS = 7;

export const QbertGame = ({ difficulty, onComplete }: QbertGameProps) => {
  const [player, setPlayer] = useState<Position>({ row: 0, col: 0 });
  const [tiles, setTiles] = useState<boolean[][]>([]);
  const [enemies, setEnemies] = useState<Position[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const startTime = useRef(Date.now());

  // Total tiles in pyramid: 1+2+3+4+5+6+7 = 28
  const totalTiles = (PYRAMID_ROWS * (PYRAMID_ROWS + 1)) / 2;
  const targetScore = Math.floor(totalTiles * (0.5 + difficulty * 0.3));

  // Initialize pyramid
  useEffect(() => {
    const newTiles: boolean[][] = [];
    for (let row = 0; row < PYRAMID_ROWS; row++) {
      newTiles[row] = new Array(row + 1).fill(false);
    }
    // Start position is colored
    newTiles[0][0] = true;
    setTiles(newTiles);
    setScore(1);

    // Spawn initial enemies
    const numEnemies = 1 + Math.floor(difficulty * 2);
    const newEnemies: Position[] = [];
    for (let i = 0; i < numEnemies; i++) {
      const row = PYRAMID_ROWS - 1;
      newEnemies.push({ row, col: Math.floor(Math.random() * row) });
    }
    setEnemies(newEnemies);
  }, [difficulty]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, score / targetScore);
    onComplete({
      moduleId: 'qbert',
      moduleType: 'qbert',
      score: scoreRatio,
      passed: score >= targetScore,
      timeSpent,
    });
  }, [gameOver, score, targetScore, onComplete]);

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

  // Enemy movement
  useEffect(() => {
    if (gameOver) return;
    const speed = 1200 - difficulty * 400;
    const interval = setInterval(() => {
      setEnemies((currentEnemies) => {
        return currentEnemies.map((enemy) => {
          // Move up towards player (opposite of Q*bert's down movement)
          const moveLeft = Math.random() > 0.5;
          let newRow = enemy.row - 1;
          let newCol = moveLeft ? enemy.col - 1 : enemy.col;

          // If enemy goes off top, respawn at bottom
          if (newRow < 0) {
            newRow = PYRAMID_ROWS - 1;
            newCol = Math.floor(Math.random() * newRow);
          }

          // Keep within bounds
          newCol = Math.max(0, Math.min(newRow, newCol));

          // Check collision with player
          if (newRow === player.row && newCol === player.col) {
            handleGameEnd();
          }

          return { row: newRow, col: newCol };
        });
      });
    }, speed);
    return () => clearInterval(interval);
  }, [gameOver, player, difficulty, handleGameEnd]);

  const move = useCallback((direction: 'upleft' | 'upright' | 'downleft' | 'downright') => {
    if (gameOver) return;

    setPlayer((p) => {
      let newRow = p.row;
      let newCol = p.col;

      switch (direction) {
        case 'upleft':
          newRow = p.row - 1;
          newCol = p.col - 1;
          break;
        case 'upright':
          newRow = p.row - 1;
          newCol = p.col;
          break;
        case 'downleft':
          newRow = p.row + 1;
          newCol = p.col;
          break;
        case 'downright':
          newRow = p.row + 1;
          newCol = p.col + 1;
          break;
      }

      // Check bounds
      if (newRow < 0 || newRow >= PYRAMID_ROWS || newCol < 0 || newCol > newRow) {
        // Fell off - game over
        handleGameEnd();
        return p;
      }

      // Check enemy collision
      if (enemies.some(e => e.row === newRow && e.col === newCol)) {
        handleGameEnd();
        return p;
      }

      // Color the tile
      setTiles((currentTiles) => {
        const newTiles = currentTiles.map(row => [...row]);
        if (!newTiles[newRow][newCol]) {
          newTiles[newRow][newCol] = true;
          setScore(s => {
            const newScore = s + 1;
            if (newScore >= targetScore) handleGameEnd();
            return newScore;
          });
        }
        return newTiles;
      });

      return { row: newRow, col: newCol };
    });
  }, [gameOver, enemies, targetScore, handleGameEnd]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'q': case 'ArrowUp': move('upleft'); break;
        case 'w': move('upright'); break;
        case 'a': case 'ArrowLeft': move('downleft'); break;
        case 's': case 'ArrowDown': case 'ArrowRight': move('downright'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, move]);

  // Calculate tile positions for isometric view
  const getTilePosition = (row: number, col: number) => {
    const tileWidth = 36;
    const tileHeight = 20;
    const startX = 140;
    const startY = 20;

    return {
      x: startX + (col - row / 2) * tileWidth,
      y: startY + row * tileHeight,
    };
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Tiles: {score}/{targetScore}</span>
        <span className={timeLeft <= 5 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <div
        className="relative bg-black rounded-lg overflow-hidden"
        style={{ width: 280, height: 180 }}
      >
        {/* Render pyramid tiles */}
        {tiles.map((row, rowIdx) =>
          row.map((colored, colIdx) => {
            const pos = getTilePosition(rowIdx, colIdx);
            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className="absolute"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: 32,
                  height: 18,
                  backgroundColor: colored ? '#00d67a' : '#ff8800',
                  transform: 'skewX(-10deg)',
                  border: '1px solid #333',
                }}
              />
            );
          })
        )}

        {/* Player */}
        {(() => {
          const pos = getTilePosition(player.row, player.col);
          return (
            <div
              className="absolute text-xl"
              style={{
                left: pos.x + 4,
                top: pos.y - 16,
              }}
            >
              🟠
            </div>
          );
        })()}

        {/* Enemies */}
        {enemies.map((enemy, i) => {
          const pos = getTilePosition(enemy.row, enemy.col);
          return (
            <div
              key={i}
              className="absolute text-lg"
              style={{
                left: pos.x + 4,
                top: pos.y - 14,
              }}
            >
              🟣
            </div>
          );
        })}
      </div>

      {/* Touch controls - diagonal layout */}
      <div className="mt-4 grid grid-cols-2 gap-2 w-32">
        <button onClick={() => move('upleft')} className="p-3 bg-surface border border-border rounded-lg text-xs">↖</button>
        <button onClick={() => move('upright')} className="p-3 bg-surface border border-border rounded-lg text-xs">↗</button>
        <button onClick={() => move('downleft')} className="p-3 bg-surface border border-border rounded-lg text-xs">↙</button>
        <button onClick={() => move('downright')} className="p-3 bg-surface border border-border rounded-lg text-xs">↘</button>
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={score >= targetScore ? 'text-primary' : 'text-danger'}>
            {score >= targetScore ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
