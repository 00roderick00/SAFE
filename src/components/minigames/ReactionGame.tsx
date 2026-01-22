import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface ReactionGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

type GameState = 'waiting' | 'ready' | 'go' | 'clicked' | 'early' | 'done';
type TimeoutHandle = ReturnType<typeof setTimeout>;

export const ReactionGame = ({ difficulty, onComplete }: ReactionGameProps) => {
  const [state, setState] = useState<GameState>('waiting');
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [goTime, setGoTime] = useState<number>(0);
  const [lastReaction, setLastReaction] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef(Date.now());
  const timerRef = useRef<TimeoutHandle | null>(null);

  const totalRounds = Math.floor(3 + difficulty * 2);
  const targetTime = 400 - difficulty * 100; // Target reaction time in ms

  useEffect(() => {
    // Start first round
    startRound();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startRound = () => {
    setState('ready');

    // Random delay before "GO"
    const delay = 1500 + Math.random() * 2000;
    timerRef.current = setTimeout(() => {
      setState('go');
      setGoTime(Date.now());
    }, delay);
  };

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;

    // Calculate score based on average reaction time
    const validTimes = reactionTimes.filter(t => t > 0);
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
  }, [gameOver, reactionTimes, targetTime, totalRounds, onComplete]);

  const handleClick = () => {
    if (gameOver) return;

    if (state === 'ready') {
      // Clicked too early
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('early');
      setLastReaction(null);
      setReactionTimes([...reactionTimes, -1]); // -1 indicates early click

      setTimeout(() => {
        if (currentRound + 1 >= totalRounds) {
          handleGameEnd();
        } else {
          setCurrentRound(r => r + 1);
          startRound();
        }
      }, 1000);
    } else if (state === 'go') {
      // Valid click
      const reaction = Date.now() - goTime;
      setLastReaction(reaction);
      setReactionTimes([...reactionTimes, reaction]);
      setState('clicked');

      setTimeout(() => {
        if (currentRound + 1 >= totalRounds) {
          handleGameEnd();
        } else {
          setCurrentRound(r => r + 1);
          startRound();
        }
      }, 1500);
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'waiting':
      case 'ready': return 'bg-danger';
      case 'go': return 'bg-primary';
      case 'clicked': return 'bg-primary/50';
      case 'early': return 'bg-warning';
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
        <span>Round: {currentRound + 1}/{totalRounds}</span>
        <span>Avg: {avgTime}ms</span>
        <span>Target: {targetTime}ms</span>
      </div>

      <button
        onClick={handleClick}
        disabled={state === 'waiting' || state === 'clicked' || state === 'early' || gameOver}
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
