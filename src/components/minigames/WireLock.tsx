import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface WireLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Wire {
  id: number;
  color: string;
  leftIndex: number;
  rightIndex: number;
  connected: boolean;
}

export const WireLock = ({ difficulty, onComplete }: WireLockProps) => {
  const [wires, setWires] = useState<Wire[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const startTime = useRef(Date.now());

  const numWires = Math.floor(4 + difficulty * 2);
  const colors = ['#ff4444', '#ffb800', '#00d67a', '#00ccff', '#a855f7', '#ff69b4', '#ffffff', '#888888'];

  // Initialize wires
  useEffect(() => {
    const newWires: Wire[] = [];
    const rightIndices = Array.from({ length: numWires }, (_, i) => i);

    // Shuffle right indices
    for (let i = rightIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rightIndices[i], rightIndices[j]] = [rightIndices[j], rightIndices[i]];
    }

    for (let i = 0; i < numWires; i++) {
      newWires.push({
        id: i,
        color: colors[i % colors.length],
        leftIndex: i,
        rightIndex: rightIndices[i],
        connected: false,
      });
    }

    setWires(newWires);
  }, [numWires]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = connectedCount / numWires;
    onComplete({
      moduleId: 'wire',
      moduleType: 'wire',
      score: success ? 1 : scoreRatio,
      passed: success,
      timeSpent,
    });
  }, [gameOver, connectedCount, numWires, onComplete]);

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

  const handleLeftClick = (wireId: number) => {
    if (gameOver) return;
    const wire = wires.find(w => w.id === wireId);
    if (wire?.connected) return;
    setSelectedLeft(wireId);
  };

  const handleRightClick = (rightIndex: number) => {
    if (gameOver || selectedLeft === null) return;

    const wire = wires.find(w => w.id === selectedLeft);
    if (!wire) return;

    // Check if this is the correct match
    if (wire.rightIndex === rightIndex) {
      setWires((current) => {
        const newWires = current.map(w =>
          w.id === selectedLeft ? { ...w, connected: true } : w
        );
        return newWires;
      });

      setConnectedCount((c) => {
        const newCount = c + 1;
        if (newCount === numWires) {
          handleGameEnd(true);
        }
        return newCount;
      });
    }

    setSelectedLeft(null);
  };

  // Sort wires by right index for display on the right side
  const rightSideWires = [...wires].sort((a, b) => a.rightIndex - b.rightIndex);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Connected: {connectedCount}/{numWires}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Connect matching colors</p>

      <div className="flex gap-8">
        {/* Left side */}
        <div className="flex flex-col gap-2">
          {wires.map((wire) => (
            <button
              key={`left-${wire.id}`}
              onClick={() => handleLeftClick(wire.id)}
              disabled={wire.connected}
              className={`w-16 h-10 rounded-l-full border-2 transition-all flex items-center justify-end pr-2
                ${selectedLeft === wire.id ? 'ring-2 ring-white scale-105' : ''}
                ${wire.connected ? 'opacity-50' : 'hover:scale-105'}
              `}
              style={{
                backgroundColor: wire.color,
                borderColor: wire.color,
              }}
            >
              {wire.connected && <span className="text-lg">✓</span>}
            </button>
          ))}
        </div>

        {/* Connection lines */}
        <div className="flex flex-col justify-center">
          {wires.filter(w => w.connected).length > 0 && (
            <div className="h-full flex flex-col justify-around">
              {wires.filter(w => w.connected).map((wire) => (
                <div
                  key={`line-${wire.id}`}
                  className="h-1 w-16 rounded"
                  style={{ backgroundColor: wire.color }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex flex-col gap-2">
          {rightSideWires.map((wire) => (
            <button
              key={`right-${wire.rightIndex}`}
              onClick={() => handleRightClick(wire.rightIndex)}
              disabled={wire.connected}
              className={`w-16 h-10 rounded-r-full border-2 transition-all flex items-center justify-start pl-2
                ${wire.connected ? 'opacity-50' : 'hover:scale-105'}
              `}
              style={{
                backgroundColor: wire.color,
                borderColor: wire.color,
              }}
            >
              {wire.connected && <span className="text-lg">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {selectedLeft !== null && (
        <p className="text-sm text-warning mt-3">
          Now tap the matching color on the right
        </p>
      )}

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={connectedCount === numWires ? 'text-primary' : 'text-danger'}>
            {connectedCount === numWires ? 'Unlocked!' : 'Time Up!'}
          </p>
        </div>
      )}
    </div>
  );
};
