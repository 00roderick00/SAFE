import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface WordSearchGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const GRID_SIZE = 8;
const WORDS = ['SAFE', 'LOCK', 'CODE', 'KEY', 'HACK', 'VAULT', 'SECURE', 'PASS'];

export const WordSearchGame = ({ difficulty, onComplete }: WordSearchGameProps) => {
  const [grid, setGrid] = useState<string[][]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ row: number; col: number }[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45);
  const startTime = useRef(Date.now());

  const targetWords = Math.floor(2 + difficulty * 2);

  // Initialize grid
  useEffect(() => {
    // Select random words
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
    const selectedWords = shuffled.slice(0, targetWords);
    setWords(selectedWords);

    // Create empty grid
    const newGrid: string[][] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      newGrid[r] = new Array(GRID_SIZE).fill('');
    }

    // Place words
    for (const word of selectedWords) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 50) {
        attempts++;
        const horizontal = Math.random() > 0.5;
        const row = Math.floor(Math.random() * GRID_SIZE);
        const col = Math.floor(Math.random() * (GRID_SIZE - word.length + 1));

        let canPlace = true;
        for (let i = 0; i < word.length; i++) {
          const r = horizontal ? row : row + i >= GRID_SIZE ? -1 : row + i;
          const c = horizontal ? col + i : col;
          if (r < 0 || r >= GRID_SIZE || c >= GRID_SIZE) {
            canPlace = false;
            break;
          }
          if (newGrid[r][c] !== '' && newGrid[r][c] !== word[i]) {
            canPlace = false;
            break;
          }
        }

        if (canPlace) {
          for (let i = 0; i < word.length; i++) {
            const r = horizontal ? row : row + i;
            const c = horizontal ? col + i : col;
            newGrid[r][c] = word[i];
          }
          placed = true;
        }
      }
    }

    // Fill empty cells with random letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (newGrid[r][c] === '') {
          newGrid[r][c] = letters[Math.floor(Math.random() * letters.length)];
        }
      }
    }

    setGrid(newGrid);
  }, [targetWords]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const scoreRatio = foundWords.size / targetWords;
    onComplete({
      moduleId: 'wordsearch',
      moduleType: 'wordsearch',
      score: scoreRatio,
      passed: foundWords.size >= targetWords,
      timeSpent,
    });
  }, [gameOver, foundWords, targetWords, onComplete]);

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

  const handleCellClick = (row: number, col: number) => {
    if (gameOver) return;

    const isSelected = selected.some(s => s.row === row && s.col === col);

    if (isSelected) {
      // Remove from selection
      setSelected(selected.filter(s => !(s.row === row && s.col === col)));
    } else {
      // Add to selection
      const newSelected = [...selected, { row, col }];
      setSelected(newSelected);

      // Check if selection forms a word
      const selectedLetters = newSelected.map(s => grid[s.row][s.col]).join('');
      const reverseLetters = [...selectedLetters].reverse().join('');

      const foundWord = words.find(
        w => (w === selectedLetters || w === reverseLetters) && !foundWords.has(w)
      );

      if (foundWord) {
        setFoundWords(new Set([...foundWords, foundWord]));
        setSelected([]);

        if (foundWords.size + 1 >= targetWords) {
          handleGameEnd();
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Found: {foundWords.size}/{targetWords}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Word list */}
      <div className="flex flex-wrap gap-2 mb-3">
        {words.map((word) => (
          <span
            key={word}
            className={`text-xs px-2 py-1 rounded ${
              foundWords.has(word)
                ? 'bg-primary/30 line-through text-text-dim'
                : 'bg-surface border border-border'
            }`}
          >
            {word}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-0.5 bg-border p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
        {grid.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            const isSelected = selected.some(s => s.row === rowIdx && s.col === colIdx);
            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                onClick={() => handleCellClick(rowIdx, colIdx)}
                className={`w-8 h-8 flex items-center justify-center text-sm font-bold rounded
                  ${isSelected ? 'bg-primary text-background' : 'bg-surface hover:bg-surface-light'}
                `}
              >
                {cell}
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-text-dim mt-2">Tap letters to select words</p>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={foundWords.size >= targetWords ? 'text-primary' : 'text-danger'}>
            {foundWords.size >= targetWords ? 'Success!' : 'Game Over'}
          </p>
        </div>
      )}
    </div>
  );
};
