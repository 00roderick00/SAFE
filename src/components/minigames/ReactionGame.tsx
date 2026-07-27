import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface ReactionGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

type GameState = 'waiting' | 'ready' | 'go' | 'clicked' | 'early' | 'missed' | 'done';
type TimeoutHandle = ReturnType<typeof setTimeout>;

/** If the player never taps after "GO", the round times out after this
 *  long and is scored as MISS_PENALTY_MS, so the game always terminates. */
const GO_TIMEOUT_MS = 2000;
const MISS_PENALTY_MS = 1500;

export const ReactionGame = ({ difficulty, onComplete }: ReactionGameProps) => {
  const [state, setState] = useState<GameState>('waiting');
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [goTime, setGoTime] = useState<number>(0);
  const [lastReaction, setLastReaction] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef<number>(0);
  useEffect(() => { startTime.current = Date.now(); }, []);
  const timerRef = useRef<TimeoutHandle | null>(null);
  const goTimeoutRef = useRef<TimeoutHandle | null>(null);
  const advanceRef = useRef<TimeoutHandle | null>(null);
  // Synchronous mirror of reactionTimes. State closures lag one update,
  // which used to drop the FINAL round from the end-of-game average —
  // scoring always reads this ref instead.
  const timesRef = useRef<number[]>([]);
  const gameOverRef = useRef(false);

  const totalRounds = Math.floor(3 + difficulty * 2);
  const targetTime = 400 - difficulty * 100; // Target reaction time in ms

  const handleGameEnd = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;

    // Calculate score based on average reaction time — includes every
    // recorded round (final round included).
    const times = timesRef.current;
    const validTimes = times.filter(t => t > 0);
    const avgTime = validTimes.length > 0
      ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
      : 999;

    // Better reaction time = higher score
    const scoreRatio = avgTime <= targetTime ? 1 : Math.max(0, 1 - (avgTime - targetTime) / 500);

    onComplete({
      moduleId: 'reaction',
      moduleType: 'reaction',
      score: scoreRatio,
      passed: validTimes.length >= Math.ceil(totalRounds * 0.6) && avgTime <= targetTime + 200,
      timeSpent,
    });
  }, [targetTime, totalRounds, onComplete]);

  function recordTime(time: number) {
    timesRef.current = [...timesRef.current, time];
    setReactionTimes(timesRef.current);
  }

  function advanceRound(delay: number) {
    advanceRef.current = setTimeout(() => {
      if (timesRef.current.length >= totalRounds) {
        handleGameEnd();
      } else {
        setCurrentRound(r => r + 1);
        startRound();
      }
    }, delay);
  }

  function handleMiss() {
    if (gameOverRef.current) return;
    recordTime(MISS_PENALTY_MS);
    setLastReaction(null);
    setState('missed');
    advanceRound(1000);
  }

  function startRound() {
    setState('ready');

    // Random delay before "GO"
    const delay = 1500 + Math.random() * 2000;
    timerRef.current = setTimeout(() => {
      setState('go');
      setGoTime(Date.now());
      // No tap at all → score the round as a slow miss and move on.
      goTimeoutRef.current = setTimeout(handleMiss, GO_TIMEOUT_MS);
    }, delay);
  }

  useEffect(() => {
    // Start first round
    startRound();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    if (gameOverRef.current) return;

    if (state === 'ready') {
      // Clicked too early
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('early');
      setLastReaction(null);
      recordTime(-1); // -1 indicates early click
      advanceRound(1000);
    } else if (state === 'go') {
      // Valid click
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
      const reaction = Date.now() - goTime;
      setLastReaction(reaction);
      recordTime(reaction);
      setState('clicked');
      advanceRound(1500);
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'waiting':
      case 'ready': return 'bg-danger';
      case 'go': return 'bg-primary';
      case 'clicked': return 'bg-primary/50';
      case 'early':
      case 'missed': return 'bg-warning';
      default: return 'bg-surface';
    }
  };

  const getStateText = () => {
    switch (state) {
      case 'waiting': return 'Get Ready...';
      case 'ready': return 'Wait for green...';
      case 'go': return 'TAP NOW!';
      case 'clicked': return lastReaction ? `${lastReaction}ms` : '';
      case 'early': return 'Too early!';
      case 'missed': return 'Too slow!';
      default: return '';
    }
  };

  const validTimes = reactionTimes.filter(t => t > 0);
  const avgTime = validTimes.length > 0
    ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length)
    : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Round: {Math.min(currentRound + 1, totalRounds)}/{totalRounds}</span>
        <span>Avg: {avgTime}ms</span>
        <span>Target: {targetTime}ms</span>
      </div>

      <button
        onClick={handleClick}
        disabled={state === 'waiting' || state === 'clicked' || state === 'early' || state === 'missed' || gameOver}
        className={`w-64 h-64 rounded-2xl flex items-center justify-center transition-colors ${getStateColor()}`}
      >
        <span className="text-2xl font-bold text-white">{getStateText()}</span>
      </button>

      {/* Reaction time history */}
      <div className="flex gap-2 mt-4">
        {reactionTimes.map((time, i) => (
          <div
            key={i}
            className={`w-12 h-8 rounded flex items-center justify-center text-xs
              ${time < 0 ? 'bg-warning' : time <= targetTime ? 'bg-primary' : 'bg-surface border border-border'}
            `}
          >
            {time < 0 ? 'X' : `${time}`}
          </div>
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={validTimes.length >= Math.ceil(totalRounds * 0.6) && avgTime <= targetTime + 200 ? 'text-primary' : 'text-danger'}>
            {validTimes.length >= Math.ceil(totalRounds * 0.6) && avgTime <= targetTime + 200 ? 'Success!' : 'Game Over'}
          </p>
          <p className="text-sm text-text-dim">Average: {avgTime}ms</p>
        </div>
      )}
    </div>
  );
};
