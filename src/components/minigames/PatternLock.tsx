import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import type { MiniGameProps } from '../../types';
import { scorePatternAttempt } from '../../game/modules';
import { gameAudio } from '../../utils/gameFeedback';
import { haptics } from '../../utils/haptics';
import { MiniGameChrome } from './MiniGameChrome';
import { createSeededPattern } from './verticalSliceConfig';

const VIEW_SIZE = 300;

export const PatternLock = ({ difficulty, seed, onComplete }: MiniGameProps) => {
  const reducedMotion = useReducedMotion();
  const config = useMemo(() => {
    const gridSize = Math.round(3 + 2 * difficulty);
    const requiredLength = Math.min(gridSize * gridSize - 1, Math.round(4 + 5 * difficulty));
    const timeLimit = Math.round(20 - 12 * difficulty);
    return { gridSize, requiredLength, timeLimit, pattern: createSeededPattern(seed || 'pattern-preview', gridSize, requiredLength) };
  }, [difficulty, seed]);
  const [userPattern, setUserPattern] = useState<number[]>([]);
  const patternRef = useRef<number[]>([]);
  const [showPattern, setShowPattern] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(config.timeLimit);
  const [status, setStatus] = useState('Memorize the numbered route.');
  const [statusTone, setStatusTone] = useState<'neutral' | 'warning' | 'success' | 'failure'>('neutral');
  const startTimeRef = useRef(0);
  const completedRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const cellSize = VIEW_SIZE / config.gridSize;

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const timeSpent = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const score = scorePatternAttempt(config, patternRef.current, timeSpent);
    const passed = score >= .65;
    setStatus(passed ? 'Route accepted. Pattern bolt released.' : score >= .5 ? 'Near miss. The route was only partially matched.' : 'Route rejected. Pattern bolt held.');
    setStatusTone(passed ? 'success' : score >= .5 ? 'warning' : 'failure');
    haptics[passed ? 'success' : 'error']();
    gameAudio.play(passed ? 'crack' : 'fail');
    window.setTimeout(() => onComplete({ moduleId: 'pattern', moduleType: 'pattern', score, passed, timeSpent }), 240);
  }, [config, onComplete]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowPattern(false);
      startTimeRef.current = Date.now();
      setStatus('Draw or tap the route in the same order.');
      gameAudio.play('ready');
    }, reducedMotion ? 900 : 1_700);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (showPattern || completedRef.current) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1_000;
      const remaining = Math.max(0, config.timeLimit - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) finish();
    }, 100);
    return () => window.clearInterval(timer);
  }, [showPattern, config.timeLimit, finish]);

  const center = (index: number) => ({
    x: (index % config.gridSize) * cellSize + cellSize / 2,
    y: Math.floor(index / config.gridSize) * cellSize + cellSize / 2,
  });

  const addNode = (index: number) => {
    if (showPattern || completedRef.current || patternRef.current.includes(index)) return;
    const next = [...patternRef.current, index];
    patternRef.current = next;
    setUserPattern(next);
    setStatus(`${next.length} of ${config.requiredLength} nodes connected.`);
    haptics.selection();
    gameAudio.play('tick');
    if (next.length >= config.requiredLength) window.setTimeout(finish, 0);
  };

  const closestNode = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const x = ((clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((clientY - rect.top) / rect.height) * VIEW_SIZE;
    const column = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (column < 0 || column >= config.gridSize || row < 0 || row >= config.gridSize) return -1;
    const index = row * config.gridSize + column;
    const point = center(index);
    return Math.hypot(x - point.x, y - point.y) <= cellSize * .43 ? index : -1;
  };

  const pathFor = (points: number[]) => points.map((point, index) => {
    const position = center(point);
    return `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`;
  }).join(' ');

  const resetAttempt = () => {
    patternRef.current = [];
    setUserPattern([]);
    setStatus('Route cleared. Start again at the first node.');
    setStatusTone('neutral');
  };

  return (
    <MiniGameChrome
      name="Pattern Lock"
      objective={`Repeat ${config.requiredLength} nodes in order`}
      timeLeft={showPattern ? config.timeLimit : timeLeft}
      progress={{ current: userPattern.length, total: config.requiredLength, label: 'Nodes' }}
      status={status}
      statusTone={statusTone}
      controls={<button className="game-control game-control--wide" onClick={resetAttempt} disabled={showPattern}><RotateCcw size={18} /><span>Clear route</span><kbd>Esc</kbd></button>}
    >
      <div
        ref={boardRef}
        className={`pattern-board ${showPattern ? 'pattern-board--memorize' : ''}`}
        onPointerDown={(event) => { setIsDrawing(true); addNode(closestNode(event.clientX, event.clientY)); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (isDrawing) addNode(closestNode(event.clientX, event.clientY)); }}
        onPointerUp={() => setIsDrawing(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') resetAttempt(); }}
      >
        <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} aria-hidden="true">
          <motion.path d={pathFor(showPattern ? config.pattern : userPattern)} fill="none" stroke={showPattern ? '#D8FF45' : '#FFAE42'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={reducedMotion ? undefined : { pathLength: 0 }} animate={{ pathLength: 1 }} />
        </svg>
        {Array.from({ length: config.gridSize * config.gridSize }, (_, index) => {
          const position = center(index);
          const shownIndex = showPattern ? config.pattern.indexOf(index) : userPattern.indexOf(index);
          const active = shownIndex >= 0;
          return (
            <button
              key={index}
              type="button"
              className={`pattern-node ${active ? 'active' : ''}`}
              style={{ left: `${position.x / VIEW_SIZE * 100}%`, top: `${position.y / VIEW_SIZE * 100}%` }}
              onClick={(event) => { event.stopPropagation(); addNode(index); }}
              disabled={showPattern}
              aria-label={`Pattern node ${index + 1}${active ? `, route position ${shownIndex + 1}` : ''}`}
            >
              <span>{active ? shownIndex + 1 : ''}</span>
            </button>
          );
        })}
      </div>
    </MiniGameChrome>
  );
};
