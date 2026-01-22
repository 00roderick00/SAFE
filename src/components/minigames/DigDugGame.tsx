import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface DigDugGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Position {
  x: number;
  y: number;
}

const GRID_SIZE = 10;
const CELL_SIZE = 28;

export const DigDugGame = ({ difficulty, onComplete }: DigDugGameProps) => {
  const [player, setPlayer] = useState<Position>({ x: 0, y: 0 });
  const [enemies, setEnemies] = useState<Position[]>([]);
  const [dug, setDug] = useState<Set<string>>(new Set(['0,0']));
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);
  const [pumping, setPumping] = useState<number | null>(null);
  const startTime = useRef(Date.now());
  const targetScore = Math.floor(2 + difficulty * 4);

  // Initialize enemies
  useEffect(() => {
    const numEnemies = 3 + Math.floor(difficulty * 3);
    const newEnemies: Position[] = [];
    for (let i = 0; i < numEnemies; i++) {
      let pos: Position;
      do {
        pos = {
          x: Math.floor(Math.random() * GRID_SIZE),
          y: Math.floor(Math.random() * GRID_SIZE),
        };
      } while ((pos.x === 0 && pos.y === 0) || newEnemies.some(e => e.x === pos.x && e.y === pos.y));
      newEnemies.push(pos);
    }
    setEnemies(newEnemies);
  }, [difficulty]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, score / targetScore);
    onComplete({
      moduleId: 'digdug',
      moduleType: 'digdug',
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
    const speed = 800 - difficulty * 300;
    const interval = setInterval(() => {
      setEnemies((currentEnemies) => {
        return currentEnemies.map((enemy, idx) => {
          if (pumping === idx) return enemy;

          // Move towards player through dug tunnels
          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y;

          let newX = enemy.x;
          let newY = enemy.y;

          if (Math.random() > 0.3) {
            if (Math.abs(dx) > Math.abs(dy)) {
              newX += dx > 0 ? 1 : -1;
            } else {
              newY += dy > 0 ? 1 : -1;
            }
          }

          newX = Math.max(0, Math.min(GRID_SIZE - 1, newX));
          newY = Math.max(0, Math.min(GRID_SIZE - 1, newY));

          // Check player collision
          if (newX === player.x && newY === player.y) {
            handleGameEnd();
          }

          return { x: newX, y: newY };
        });
      });
    }, speed);
    return () => clearInterval(interval);
  }, [gameOver, player, difficulty, pumping, handleGameEnd]);

  // Pumping mechanic
  useEffect(() => {
    if (pumping === null || gameOver) return;
    const pumpInterval = setInterval(() => {
      setEnemies((currentEnemies) => {
        const enemy = currentEnemies[pumping];
        if (!enemy) {
          setPumping(null);
          return currentEnemies;
        }

        // Check if still adjacent
        const dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
        if (dist > 1) {
          setPumping(null);
          return currentEnemies;
        }

        // Kill enemy after pumping
        setScore(s => {
          const newScore = s + 1;
          if (newScore >= targetScore) handleGameEnd();
          return newScore;
        });
        setPumping(null);
        return currentEnemies.filter((_, i) => i !== pumping);
      });
    }, 500);
    return () => clearInterval(pumpInterval);
  }, [pumping, gameOver, player, targetScore, handleGameEnd]);

  const move = useCallback((dx: number, dy: number) => {
    if (gameOver) return;

    setPlayer((p) => {
      const newX = Math.max(0, Math.min(GRID_SIZE - 1, p.x + dx));
      const newY = Math.max(0, Math.min(GRID_SIZE - 1, p.y + dy));

      // Dig the new cell
      setDug((d) => new Set([...d, `${newX},${newY}`]));

      // Check for pump attack
      const adjacentEnemy = enemies.findIndex(
        e => e.x === newX && e.y === newY
      );
      if (adjacentEnemy >= 0) {
        setPumping(adjacentEnemy);
      }

      return { x: newX, y: newY };
    });
  }, [gameOver, enemies]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'ArrowUp': move(0, -1); break;
        case 'ArrowDown': move(0, 1); break;
        case 'ArrowLeft': move(-1, 0); break;
        case 'ArrowRight': move(1, 0); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, move]);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Defeats: {score}/{targetScore}</span>
        <span className={timeLeft <= 5 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          width: GRID_SIZE * CELL_SIZE,
          height: GRID_SIZE * CELL_SIZE,
          background: '#8B4513',
        }}
      >
        {/* Dug tunnels */}
        {Array.from(dug).map((key) => {
          const [x, y] = key.split(',').map(Number);
          return (
            <div
              key={key}
              className="absolute bg-surface-light"
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          );
        })}

        {/* Player */}
        <div
          className="absolute text-xl flex items-center justify-center"
          style={{
            left: player.x * CELL_SIZE,
            top: player.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        >
          ⛏️
        </div>

        {/* Enemies */}
        {enemies.map((enemy, i) => (
          <div
            key={i}
            className={`absolute text-xl flex items-center justify-center ${pumping === i ? 'animate-pulse scale-125' : ''}`}
            style={{
              left: enemy.x * CELL_SIZE,
              top: enemy.y * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
            }}
          >
            👹
          </div>
        ))}
      </div>

      {/* Touch controls */}
      <div className="grid grid-cols-3 gap-2 mt-4 w-36">
        <div />
        <button onClick={() => move(0, -1)} className="p-3 bg-surface border border-border rounded-lg">^</button>
        <div />
        <button onClick={() => move(-1, 0)} className="p-3 bg-surface border border-border rounded-lg">{'<'}</button>
        <button onClick={() => move(0, 1)} className="p-3 bg-surface border border-border rounded-lg">v</button>
        <button onClick={() => move(1, 0)} className="p-3 bg-surface border border-border rounded-lg">{'>'}</button>
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
