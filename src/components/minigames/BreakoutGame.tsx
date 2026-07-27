import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface BreakoutGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const CANVAS_WIDTH = 280;
const CANVAS_HEIGHT = 220;
const PADDLE_WIDTH = 60;
const PADDLE_HEIGHT = 10;
const BALL_RADIUS = 6;
const BRICK_ROWS = 4;
const BRICK_COLS = 7;
const BRICK_WIDTH = 36;
const BRICK_HEIGHT = 14;
const BRICK_GAP = 3;
const BRICK_TOP = 30;

const BRICK_COLORS = [
  { fill: '#ff4444', glow: '#ff444466' },
  { fill: '#ff8800', glow: '#ff880066' },
  { fill: '#ffbb00', glow: '#ffbb0066' },
  { fill: '#00d67a', glow: '#00d67a66' },
];

const createInitialBricks = (): boolean[][] =>
  Array.from({ length: BRICK_ROWS }, () => Array<boolean>(BRICK_COLS).fill(true));

export const BreakoutGame = ({ difficulty, onComplete }: BreakoutGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paddleX, setPaddleX] = useState(CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2);
  const ballRef = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 40, dx: 3, dy: -3 });
  // Simulation state lives in refs so the rAF loop effect is not torn
  // down and rebuilt on every brick hit; `score` state exists only to
  // drive the UI counter.
  const bricksRef = useRef<boolean[][]>(createInitialBricks());
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(35);
  const [gameStarted, setGameStarted] = useState(false);
  const startTime = useRef<number>(0);
  useEffect(() => { startTime.current = Date.now(); }, []);
  const paddleRef = useRef(paddleX);
  const animationRef = useRef<number | null>(null);
  const totalBricks = BRICK_ROWS * BRICK_COLS;
  const targetScore = Math.floor(totalBricks * (0.4 + difficulty * 0.35));

  // Keep paddle ref updated
  useEffect(() => {
    paddleRef.current = paddleX;
  }, [paddleX]);

  const handleGameEnd = useCallback((won: boolean = false) => {
    if (gameOver) return;
    setGameOver(true);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    const timeSpent = Date.now() - startTime.current;
    const currentScore = scoreRef.current;
    const scoreRatio = Math.min(1, currentScore / targetScore);
    onComplete({
      moduleId: 'breakout',
      moduleType: 'breakout',
      score: scoreRatio,
      passed: won || currentScore >= targetScore,
      timeSpent,
    });
  }, [gameOver, targetScore, onComplete]);

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

  // Game loop — fixed-timestep accumulator. The simulation advances in
  // 1000/60 ms steps of wall-clock time, so a 120Hz display runs the
  // ball at the same real-world speed as a 60Hz one.
  useEffect(() => {
    if (gameOver || !gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ballSpeed = 3.5 + difficulty * 2;
    const STEP_MS = 1000 / 60;
    const MAX_FRAME_MS = 250; // cap catch-up after a backgrounded tab
    let lastTime: number | null = null;
    let accumulator = 0;
    let ended = false;

    // One fixed simulation step (identical physics to the old
    // once-per-frame update).
    const stepSimulation = () => {
      const ball = ballRef.current;
      const currentBricks = bricksRef.current;

      // Update ball position
      ball.x += ball.dx;
      ball.y += ball.dy;

      // Wall collisions
      if (ball.x <= BALL_RADIUS || ball.x >= CANVAS_WIDTH - BALL_RADIUS) {
        ball.dx = -ball.dx;
      }
      if (ball.y <= BALL_RADIUS) {
        ball.dy = -ball.dy;
      }

      // Paddle collision
      const paddle = paddleRef.current;
      if (ball.y >= CANVAS_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 5 &&
          ball.y <= CANVAS_HEIGHT - PADDLE_HEIGHT &&
          ball.x >= paddle && ball.x <= paddle + PADDLE_WIDTH) {
        ball.dy = -Math.abs(ball.dy);
        // Angle based on hit position
        const hitPos = (ball.x - paddle) / PADDLE_WIDTH;
        ball.dx = (hitPos - 0.5) * ballSpeed * 2;
      }

      // Bottom - lose ball
      if (ball.y >= CANVAS_HEIGHT + BALL_RADIUS) {
        ended = true;
        handleGameEnd();
        return;
      }

      // Brick collisions
      for (let r = 0; r < BRICK_ROWS; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
          if (currentBricks[r]?.[c]) {
            const brickX = c * (BRICK_WIDTH + BRICK_GAP) + (CANVAS_WIDTH - BRICK_COLS * (BRICK_WIDTH + BRICK_GAP) + BRICK_GAP) / 2;
            const brickY = r * (BRICK_HEIGHT + BRICK_GAP) + BRICK_TOP;

            if (ball.x + BALL_RADIUS > brickX &&
                ball.x - BALL_RADIUS < brickX + BRICK_WIDTH &&
                ball.y + BALL_RADIUS > brickY &&
                ball.y - BALL_RADIUS < brickY + BRICK_HEIGHT) {
              currentBricks[r][c] = false;
              ball.dy = -ball.dy;
              scoreRef.current += 1;
              setScore(scoreRef.current);

              if (scoreRef.current >= targetScore) {
                ended = true;
                handleGameEnd(true);
                return;
              }
            }
          }
        }
      }
    };

    const draw = () => {
      const ball = ballRef.current;
      const paddle = paddleRef.current;
      const currentBricks = bricksRef.current;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#0a0a0a');
      gradient.addColorStop(1, '#151515');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw bricks
      for (let r = 0; r < BRICK_ROWS; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
          if (currentBricks[r]?.[c]) {
            const brickX = c * (BRICK_WIDTH + BRICK_GAP) + (CANVAS_WIDTH - BRICK_COLS * (BRICK_WIDTH + BRICK_GAP) + BRICK_GAP) / 2;
            const brickY = r * (BRICK_HEIGHT + BRICK_GAP) + BRICK_TOP;
            const color = BRICK_COLORS[r % BRICK_COLORS.length];

            // Glow
            ctx.shadowColor = color.glow;
            ctx.shadowBlur = 8;

            // Brick
            ctx.fillStyle = color.fill;
            ctx.beginPath();
            ctx.roundRect(brickX, brickY, BRICK_WIDTH, BRICK_HEIGHT, 3);
            ctx.fill();

            // Highlight
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(brickX + 2, brickY + 2, BRICK_WIDTH - 4, 3);
          }
        }
      }

      // Draw paddle
      ctx.shadowColor = '#00d67a66';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#00d67a';
      ctx.beginPath();
      ctx.roundRect(paddle, CANVAS_HEIGHT - PADDLE_HEIGHT - 5, PADDLE_WIDTH, PADDLE_HEIGHT, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw ball
      ctx.shadowColor = '#ffffff88';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const gameLoop = (timestamp: number) => {
      if (ended) return;

      if (lastTime === null) lastTime = timestamp;
      accumulator += Math.max(0, Math.min(MAX_FRAME_MS, timestamp - lastTime));
      lastTime = timestamp;

      while (accumulator >= STEP_MS) {
        accumulator -= STEP_MS;
        stepSimulation();
        if (ended) return;
      }

      draw();
      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameOver, gameStarted, difficulty, handleGameEnd, targetScore]);

  // Mouse/touch controls
  const handleMove = (clientX: number, rect: DOMRect) => {
    if (!gameStarted) {
      setGameStarted(true);
      startTime.current = Date.now();
    }
    const x = clientX - rect.left - PADDLE_WIDTH / 2;
    setPaddleX(Math.max(0, Math.min(CANVAS_WIDTH - PADDLE_WIDTH, x)));
  };

  return (
    <div className="flex flex-col items-center">
      {/* Game Title */}
      <h3 className="text-lg font-bold text-primary mb-2">BREAKOUT</h3>

      {/* Status bar */}
      <div className="flex justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Bricks:</span>
          <span className={`font-mono font-bold ${score >= targetScore ? 'text-primary' : 'text-white'}`}>
            {score}/{targetScore}
          </span>
        </div>
        <div className={`font-mono font-bold ${timeLeft <= 5 ? 'text-danger animate-pulse' : 'text-text-dim'}`}>
          {timeLeft}s
        </div>
      </div>

      {/* Game canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-lg border-2 border-border cursor-pointer touch-none"
          onMouseMove={(e) => handleMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => {
            e.preventDefault();
            handleMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          }}
          onClick={() => {
            if (!gameStarted) {
              setGameStarted(true);
              startTime.current = Date.now();
            }
          }}
        />

        {/* Start overlay */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <p className="text-white text-sm font-medium">Move to Start</p>
          </div>
        )}
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
