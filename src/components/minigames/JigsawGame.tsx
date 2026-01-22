import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface JigsawGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Piece {
  id: number;
  currentPos: number;
  correctPos: number;
  color: string;
}

const GRID_SIZE = 3; // 3x3 grid = 9 pieces

export const JigsawGame = ({ difficulty, onComplete }: JigsawGameProps) => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(35);
  const startTime = useRef(Date.now());
  const totalPieces = GRID_SIZE * GRID_SIZE;

  const colors = [
    '#ff4444', '#ff8800', '#ffcc00',
    '#44ff44', '#00ccff', '#4444ff',
    '#cc44ff', '#ff44cc', '#888888',
  ];

  // Initialize puzzle
  useEffect(() => {
    const newPieces: Piece[] = [];
    const positions = Array.from({ length: totalPieces }, (_, i) => i);

    // Shuffle positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < totalPieces; i++) {
      newPieces.push({
        id: i,
        currentPos: positions[i],
        correctPos: i,
        color: colors[i],
      });
    }

    setPieces(newPieces);

    // Count initially correct pieces
    const correct = newPieces.filter(p => p.currentPos === p.correctPos).length;
    setCorrectCount(correct);
  }, []);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = correctCount / totalPieces;
    onComplete({
      moduleId: 'jigsaw',
      moduleType: 'jigsaw',
      score: scoreRatio,
      passed: correctCount === totalPieces,
      timeSpent,
    });
  }, [gameOver, correctCount, totalPieces, onComplete]);

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

  const handlePieceClick = (pieceId: number) => {
    if (gameOver) return;

    if (selectedPiece === null) {
      setSelectedPiece(pieceId);
    } else {
      // Swap pieces
      setPieces((current) => {
        const newPieces = [...current];
        const piece1 = newPieces.find(p => p.id === selectedPiece)!;
        const piece2 = newPieces.find(p => p.id === pieceId)!;

        const tempPos = piece1.currentPos;
        piece1.currentPos = piece2.currentPos;
        piece2.currentPos = tempPos;

        // Count correct pieces
        const correct = newPieces.filter(p => p.currentPos === p.correctPos).length;
        setCorrectCount(correct);

        if (correct === totalPieces) {
          handleGameEnd();
        }

        return newPieces;
      });
      setSelectedPiece(null);
    }
  };

  // Sort pieces by current position for display
  const sortedPieces = [...pieces].sort((a, b) => a.currentPos - b.currentPos);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Correct: {correctCount}/{totalPieces}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Tap two pieces to swap them</p>

      {/* Puzzle grid */}
      <div className="grid grid-cols-3 gap-1 bg-border p-1 rounded-lg">
        {sortedPieces.map((piece) => {
          const isSelected = selectedPiece === piece.id;
          const isCorrect = piece.currentPos === piece.correctPos;

          return (
            <button
              key={piece.id}
              onClick={() => handlePieceClick(piece.id)}
              className={`w-20 h-20 rounded-lg flex items-center justify-center text-2xl font-bold transition-all
                ${isSelected ? 'ring-4 ring-primary scale-105' : ''}
                ${isCorrect ? 'ring-2 ring-green-500' : ''}
              `}
              style={{ backgroundColor: piece.color }}
            >
              <span className="text-white text-shadow">{piece.correctPos + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Reference image */}
      <div className="mt-4">
        <p className="text-xs text-text-dim mb-1 text-center">Target arrangement:</p>
        <div className="grid grid-cols-3 gap-0.5 scale-50 origin-top">
          {colors.map((color, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <span className="text-white text-xs">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={correctCount === totalPieces ? 'text-primary' : 'text-danger'}>
            {correctCount === totalPieces ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
