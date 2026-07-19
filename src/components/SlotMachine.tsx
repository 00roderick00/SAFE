import { motion } from 'framer-motion';
import { SecurityModule } from '../types';
import { GameIcon } from './game';

interface SlotMachineProps {
  modules: SecurityModule[];
  onSlotClick: (index: number) => void;
}

export const SlotMachine = ({ modules, onSlotClick }: SlotMachineProps) => {
  const getDifficultyLabel = (difficulty: number): string => {
    if (difficulty < 0.33) return 'Easy';
    if (difficulty < 0.66) return 'Med';
    return 'Hard';
  };

  const getDifficultyColor = (difficulty: number): string => {
    if (difficulty < 0.33) return 'text-primary';
    if (difficulty < 0.66) return 'text-warning';
    return 'text-danger';
  };

  return (
    <div className="flex gap-3 justify-center">
      {modules.map((module, index) => (
        <motion.button
          key={module.id}
          className="flex flex-col items-center justify-center w-24 h-28 bg-surface border border-border rounded-2xl hover:border-primary/50 transition-colors"
          onClick={() => onSlotClick(index)}
          aria-label={`Configure lock ${index + 1}: ${module.name}, ${getDifficultyLabel(module.difficulty)} difficulty`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <GameIcon type={module.type} size={32} />
          <span className={`text-xs font-medium ${getDifficultyColor(module.difficulty)}`}>
            {getDifficultyLabel(module.difficulty)}
          </span>
        </motion.button>
      ))}
    </div>
  );
};
