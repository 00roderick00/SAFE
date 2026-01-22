import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface SequenceLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

export const SequenceLock = ({ difficulty, onComplete }: SequenceLockProps) => {
  const [sequence, setSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [showingSequence, setShowingSequence] = useState(true);
  const [activeButton, setActiveButton] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [round, setRound] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const startTime = useRef(Date.now());

  const gridSize = 9; // 3x3 grid
  const sequenceLength = Math.floor(3 + difficulty * 2);
  const maxAttempts = 3;
  const totalRounds = 3;

  const generateSequence = useCallback(() => {
    const newSeq = [];
    for (let i = 0; i < sequenceLength; i++) {
      newSeq.push(Math.floor(Math.random() * gridSize));
    }
    return newSeq;
  }, [sequenceLength, gridSize]);

  const showSequenceAnimation = useCallback((seq: number[]) => {
    setShowingSequence(true);
    seq.forEach((btn, idx) => {
      setTimeout(() => {
        setActiveButton(btn);
      }, idx * 600);

      setTimeout(() => {
        setActiveButton(null);
      }, idx * 600 + 400);
    });

    setTimeout(() => {
      setShowingSequence(false);
    }, seq.length * 600 + 200);
  }, []);

  useEffect(() => {
    const newSeq = generateSequence();
    setSequence(newSeq);
    showSequenceAnimation(newSeq);
  }, [round, generateSequence, showSequenceAnimation]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = success ? 1 : (round - 1) / totalRounds;
    onComplete({
      moduleId: 'sequence',
      moduleType: 'sequence',
      score: scoreRatio,
      passed: success,
      timeSpent,
    });
  }, [gameOver, round, totalRounds, onComplete]);

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

  const handleButtonClick = (index: number) => {
    if (showingSequence || gameOver) return;

    // Flash the button
    setActiveButton(index);
    setTimeout(() => setActiveButton(null), 200);

    const newUserSeq = [...userSequence, index];
    setUserSequence(newUserSeq);

    // Check if correct so far
    const correctSoFar = newUserSeq.every((btn, i) => btn === sequence[i]);

    if (!correctSoFar) {
      // Wrong!
      setAttempts((a) => {
        const newAttempts = a + 1;
        if (newAttempts >= maxAttempts) {
          handleGameEnd(false);
        } else {
          // Reset and show sequence again
          setUserSequence([]);
          setTimeout(() => showSequenceAnimation(sequence), 500);
        }
        return newAttempts;
      });
    } else if (newUserSeq.length === sequence.length) {
      // Completed round!
      if (round >= totalRounds) {
        handleGameEnd(true);
      } else {
        setRound(r => r + 1);
        setUserSequence([]);
      }
    }
  };

  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Round: {round}/{totalRounds}</span>
        <span>Attempts: {attempts}/{maxAttempts}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">
        {showingSequence ? 'Watch the sequence...' : 'Repeat the pattern!'}
      </p>

      {/* Progress */}
      <div className="flex gap-1 mb-3">
        {sequence.map((_, i) => (
          <div
            key={i}
            className={`w-4 h-2 rounded-full ${i < userSequence.length ? 'bg-primary' : 'bg-surface-light'}`}
          />
        ))}
      </div>

      {/* Button grid */}
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: gridSize }).map((_, index) => (
          <button
            key={index}
            onClick={() => handleButtonClick(index)}
            disabled={showingSequence || gameOver}
            className={`w-20 h-20 rounded-xl transition-all duration-200
              ${activeButton === index ? `${colors[index]} scale-110` : 'bg-surface border border-border'}
              ${showingSequence ? 'cursor-default' : 'hover:bg-surface-light active:scale-95'}
            `}
          />
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={round > totalRounds || (round === totalRounds && userSequence.length === sequence.length) ? 'text-primary' : 'text-danger'}>
            {round > totalRounds || (round === totalRounds && userSequence.length === sequence.length) ? 'Unlocked!' : 'Locked Out!'}
          </p>
        </div>
      )}
    </div>
  );
};
