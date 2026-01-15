import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface MemoryMatchProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Card {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const EMOJIS = ['🚀', '🎮', '💎', '🔥', '⚡', '🌟', '🎯', '🎪', '🎨', '🎸', '🎭', '🎬'];

export const MemoryMatch = ({ difficulty, onComplete }: MemoryMatchProps) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matches, setMatches] = useState(0);
  const [totalPairs, setTotalPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameOver, setGameOver] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const startTime = useRef(Date.now());

  // Initialize cards
  useEffect(() => {
    const pairCount = difficulty < 0.33 ? 4 : difficulty < 0.66 ? 6 : 8;
    const selectedEmojis = EMOJIS.slice(0, pairCount);
    const cardPairs = [...selectedEmojis, ...selectedEmojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({
        id: index,
        emoji,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(cardPairs);
    setTotalPairs(pairCount);
  }, [difficulty]);

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
  }, [gameOver]);

  // Check for match
  useEffect(() => {
    if (flippedCards.length === 2) {
      setIsChecking(true);
      const [first, second] = flippedCards;
      const firstCard = cards.find((c) => c.id === first);
      const secondCard = cards.find((c) => c.id === second);

      if (firstCard && secondCard && firstCard.emoji === secondCard.emoji) {
        // Match found
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === first || c.id === second ? { ...c, isMatched: true } : c
            )
          );
          setMatches((m) => m + 1);
          setFlippedCards([]);
          setIsChecking(false);
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === first || c.id === second ? { ...c, isFlipped: false } : c
            )
          );
          setFlippedCards([]);
          setIsChecking(false);
        }, 800);
      }
    }
  }, [flippedCards, cards]);

  // Check win condition
  useEffect(() => {
    if (totalPairs > 0 && matches === totalPairs) {
      handleGameEnd();
    }
  }, [matches, totalPairs]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const percentComplete = totalPairs > 0 ? matches / totalPairs : 0;
    // Bonus for fewer moves
    const efficiency = moves > 0 ? Math.max(0, 1 - (moves - totalPairs) / (totalPairs * 2)) : 1;
    const finalScore = percentComplete * 0.7 + efficiency * 0.3;

    onComplete({
      moduleId: 'memorymatch',
      moduleType: 'memorymatch',
      score: finalScore,
      passed: finalScore >= 0.4,
      timeSpent,
    });
  }, [gameOver, matches, totalPairs, moves, onComplete]);

  const handleCardClick = (cardId: number) => {
    if (gameOver || isChecking) return;

    const card = cards.find((c) => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched) return;
    if (flippedCards.length >= 2) return;

    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isFlipped: true } : c))
    );
    setFlippedCards((prev) => [...prev, cardId]);
    setMoves((m) => m + 1);
  };

  const gridCols = totalPairs <= 4 ? 4 : totalPairs <= 6 ? 4 : 4;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-4 px-2">
        <span className="text-primary font-display">
          Pairs: {matches}/{totalPairs}
        </span>
        <span className="text-text-dim font-display">Moves: {moves}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Card Grid */}
      <div
        className="grid gap-2 p-2"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          width: '100%',
          maxWidth: '300px',
        }}
      >
        {cards.map((card) => (
          <motion.button
            key={card.id}
            className={`aspect-square rounded-lg flex items-center justify-center text-2xl ${
              card.isFlipped || card.isMatched
                ? 'bg-surface-light'
                : 'bg-primary/30 hover:bg-primary/40'
            } ${card.isMatched ? 'border-2 border-primary' : ''}`}
            onClick={() => handleCardClick(card.id)}
            whileTap={{ scale: 0.95 }}
            animate={{
              rotateY: card.isFlipped || card.isMatched ? 180 : 0,
            }}
            transition={{ duration: 0.3 }}
            style={{ minHeight: '50px' }}
          >
            <motion.span
              animate={{
                rotateY: card.isFlipped || card.isMatched ? 180 : 0,
                opacity: card.isFlipped || card.isMatched ? 1 : 0,
              }}
              transition={{ duration: 0.3 }}
            >
              {card.isFlipped || card.isMatched ? card.emoji : ''}
            </motion.span>
            {!card.isFlipped && !card.isMatched && (
              <span className="text-primary/50">?</span>
            )}
          </motion.button>
        ))}
      </div>

      <p className="mt-4 text-sm text-text-dim">Find all the matching pairs!</p>
    </div>
  );
};
