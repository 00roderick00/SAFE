import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Crosshair } from 'lucide-react';
import { MiniGameResult } from '../../types';

interface GalagaGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Entity {
  x: number;
  y: number;
  active: boolean;
}

const CANVAS_WIDTH = 260;
const CANVAS_HEIGHT = 300;

export const GalagaGame = ({ difficulty, onComplete }: GalagaGameProps) => {
  const [playerX, setPlayerX] = useState(CANVAS_WIDTH / 2);
  const [bullets, setBullets] = useState<Entity[]>([]);
  const [enemies, setEnemies] = useState<Entity[]>([]);
  const [enemyBullets, setEnemyBullets] = useState<Entity[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);
  const [wave, setWave] = useState(1);
  const [gameStarted, setGameStarted] = useState(false);
  const startTime = useRef(Date.now());
  const targetScore = Math.floor(8 + difficulty * 12);

  // Initialize enemies
  const spawnWave = useCallback(() => {
    const newEnemies: Entity[] = [];
    const rows = 2 + Math.floor(wave / 2);
    const cols = Math.min(5 + wave, 7);
    const spacing = CANVAS_WIDTH / (cols + 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newEnemies.push({
          x: spacing * (c + 1),
          y: 40 + r * 35,
          active: true,
        });
      }
    }
    setEnemies(newEnemies);
  }, [wave]);

  useEffect(() => {
    spawnWave();
  }, [wave, spawnWave]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = Math.min(1, score / targetScore);
    onComplete({
      moduleId: 'galaga',
      moduleType: 'galaga',
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

    const interval = setInterval(() => {
      // Move bullets
      setBullets((b) => b.map(bullet => ({ ...bullet, y: bullet.y - 10 })).filter(b => b.y > 0 && b.active));

      // Move enemy bullets
      setEnemyBullets((b) => b.map(bullet => ({ ...bullet, y: bullet.y + 6 })).filter(b => b.y < CANVAS_HEIGHT));

      // Check bullet-enemy collisions
      setBullets((currentBullets) => {
        const newBullets = [...currentBullets];
        setEnemies((currentEnemies) => {
          return currentEnemies.map(enemy => {
            if (!enemy.active) return enemy;
            for (let i = 0; i < newBullets.length; i++) {
              const b = newBullets[i];
              if (b.active && Math.abs(b.x - enemy.x) < 18 && Math.abs(b.y - enemy.y) < 18) {
                newBullets[i] = { ...b, active: false };
                setScore(s => {
                  const newScore = s + 1;
                  if (newScore >= targetScore) handleGameEnd();
                  return newScore;
                });
                return { ...enemy, active: false };
              }
            }
            return enemy;
          });
        });
        return newBullets.filter(b => b.active);
      });

      // Check enemy bullet-player collision
      setEnemyBullets((currentBullets) => {
        for (const b of currentBullets) {
          if (Math.abs(b.x - playerX) < 18 && b.y > CANVAS_HEIGHT - 50) {
            handleGameEnd();
          }
        }
        return currentBullets;
      });

      // Enemy shooting
      setEnemies((currentEnemies) => {
        const activeEnemies = currentEnemies.filter(e => e.active);
        if (activeEnemies.length > 0 && Math.random() < 0.04 + difficulty * 0.04) {
          const shooter = activeEnemies[Math.floor(Math.random() * activeEnemies.length)];
          setEnemyBullets(b => [...b, { x: shooter.x, y: shooter.y + 15, active: true }]);
        }

        // Check if wave cleared
        if (activeEnemies.length === 0) {
          setWave(w => w + 1);
        }
        return currentEnemies;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [gameOver, gameStarted, playerX, difficulty, targetScore, handleGameEnd]);

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      if (!gameStarted) {
        setGameStarted(true);
        startTime.current = Date.now();
      }
      if (e.key === 'ArrowLeft') setPlayerX(x => Math.max(20, x - 18));
      if (e.key === 'ArrowRight') setPlayerX(x => Math.min(CANVAS_WIDTH - 20, x + 18));
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, gameStarted, playerX]);

  const shoot = () => {
    if (gameOver) return;
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
    setBullets(b => [...b, { x: playerX, y: CANVAS_HEIGHT - 55, active: true }]);
  };

  const moveLeft = () => {
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
    setPlayerX(x => Math.max(20, x - 22));
  };

  const moveRight = () => {
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
    setPlayerX(x => Math.min(CANVAS_WIDTH - 20, x + 22));
  };

  return (
    <div className="flex flex-col items-center">
      {/* Game Title */}
      <h3 className="text-lg font-bold text-primary mb-2">GALAGA</h3>

      {/* Status bar */}
      <div className="flex justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Kills:</span>
          <span className={`font-mono font-bold ${score >= targetScore ? 'text-primary' : 'text-white'}`}>
            {score}/{targetScore}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim">Wave {wave}</span>
          <span className={`font-mono font-bold ${timeLeft <= 5 ? 'text-danger animate-pulse' : 'text-text-dim'}`}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Game area */}
      <div
        className="relative rounded-lg overflow-hidden border-2 border-border"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 50%, #0f0f20 100%)'
        }}
        onClick={shoot}
      >
        {/* Stars background */}
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/40"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: Math.random() * 2 + 1,
              height: Math.random() * 2 + 1,
            }}
          />
        ))}

        {/* Player ship */}
        <motion.div
          className="absolute"
          animate={{ x: playerX - 15 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{ bottom: 15 }}
        >
          <svg width="30" height="30" viewBox="0 0 30 30">
            <polygon
              points="15,0 25,25 15,20 5,25"
              fill="#00d67a"
              filter="drop-shadow(0 0 4px #00d67a)"
            />
            <polygon
              points="15,5 20,20 15,17 10,20"
              fill="#00ff88"
            />
          </svg>
        </motion.div>

        {/* Enemies */}
        {enemies.filter(e => e.active).map((enemy, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{ scale: 0 }}
            animate={{ scale: 1, y: [0, 3, 0] }}
            transition={{ y: { duration: 1, repeat: Infinity } }}
            style={{ left: enemy.x - 12, top: enemy.y - 12 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <ellipse cx="12" cy="8" rx="8" ry="6" fill="#ff4444" />
              <circle cx="8" cy="7" r="2" fill="#fff" />
              <circle cx="16" cy="7" r="2" fill="#fff" />
              <circle cx="8" cy="7" r="1" fill="#000" />
              <circle cx="16" cy="7" r="1" fill="#000" />
              <path d="M4,14 Q12,20 20,14" stroke="#ff4444" strokeWidth="3" fill="none" />
              <path d="M6,16 L4,22" stroke="#ff4444" strokeWidth="2" />
              <path d="M18,16 L20,22" stroke="#ff4444" strokeWidth="2" />
            </svg>
          </motion.div>
        ))}

        {/* Player bullets */}
        {bullets.map((b, i) => (
          <motion.div
            key={`b-${i}`}
            className="absolute"
            style={{ left: b.x - 2, top: b.y }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <div
              className="w-1 h-4 rounded-full"
              style={{
                background: 'linear-gradient(180deg, #00ff88, #00d67a)',
                boxShadow: '0 0 6px #00d67a'
              }}
            />
          </motion.div>
        ))}

        {/* Enemy bullets */}
        {enemyBullets.map((b, i) => (
          <motion.div
            key={`eb-${i}`}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: b.x - 4,
              top: b.y,
              background: 'radial-gradient(circle, #ff6666, #ff4444)',
              boxShadow: '0 0 6px #ff4444'
            }}
          />
        ))}

        {/* Start overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white text-sm font-medium">Tap to Start</p>
          </div>
        )}
      </div>

      {/* Touch controls */}
      <div className="flex gap-3 mt-4">
        <motion.button
          onClick={moveLeft}
          className="p-4 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft size={24} className="text-primary" />
        </motion.button>
        <motion.button
          onClick={shoot}
          className="px-6 py-4 bg-danger/20 border border-danger/50 rounded-lg flex items-center justify-center gap-2 active:bg-danger/30"
          whileTap={{ scale: 0.95 }}
        >
          <Crosshair size={20} className="text-danger" />
          <span className="text-danger font-bold">FIRE</span>
        </motion.button>
        <motion.button
          onClick={moveRight}
          className="p-4 bg-surface border border-border rounded-lg flex items-center justify-center active:bg-primary/20"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowRight size={24} className="text-primary" />
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
