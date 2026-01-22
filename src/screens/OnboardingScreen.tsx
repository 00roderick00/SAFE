import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Shield, Target, Lock, Zap, Trophy, Coins } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';

interface OnboardingStep {
  icon: React.ElementType;
  title: string;
  description: string;
  highlight: string;
  color: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: Shield,
    title: 'Welcome to SAFE',
    description: 'Your tokens are stored in a digital safe protected by security games. The better your security, the harder it is for others to steal from you.',
    highlight: 'Your safe is your vault!',
    color: 'text-primary',
  },
  {
    icon: Lock,
    title: 'Set Up Security',
    description: 'Choose 3 security games (locks) to protect your safe. Mix arcade games, puzzles, and classic locks. Higher difficulty means better protection!',
    highlight: 'More difficult = more secure',
    color: 'text-warning',
  },
  {
    icon: Target,
    title: 'Go on Heists',
    description: 'Attack other safes to steal their tokens! But beware - while on a heist, your own safe becomes vulnerable to attacks.',
    highlight: 'High risk, high reward!',
    color: 'text-danger',
  },
  {
    icon: Zap,
    title: 'Beat the Games',
    description: 'To breach a safe, you must beat all 3 of their security games. Score above the threshold to crack each lock and claim the loot!',
    highlight: 'Skill determines success',
    color: 'text-primary',
  },
  {
    icon: Coins,
    title: 'Earn & Defend',
    description: 'When attackers fail to breach your safe, you keep their attack fee! Strong security means passive income from failed attacks.',
    highlight: 'Defense pays dividends',
    color: 'text-primary',
  },
  {
    icon: Trophy,
    title: 'Climb the Ranks',
    description: 'Compete on the leaderboard, unlock achievements, and become the ultimate safe cracker! Are you ready?',
    highlight: "Let's go!",
    color: 'text-warning',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [username, setUsername] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const { setUsername: saveUsername, completeOnboarding } = usePlayerStore();

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      setShowNameInput(true);
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleStart = () => {
    if (username.trim()) {
      saveUsername(username.trim());
    }
    completeOnboarding();
    onComplete();
  };

  const handleSkip = () => {
    completeOnboarding();
    onComplete();
  };

  if (showNameInput) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <span className="text-6xl block mb-6">👤</span>
          <h1 className="text-2xl font-semibold mb-2">What's your name?</h1>
          <p className="text-text-dim text-sm mb-6">
            This will be shown on the leaderboard
          </p>

          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-center text-lg focus:outline-none focus:border-primary mb-4"
            maxLength={20}
            autoFocus
          />

          <button
            onClick={handleStart}
            className="w-full py-4 bg-primary text-background font-semibold rounded-xl text-lg hover:opacity-90 transition-opacity"
          >
            Start Playing
          </button>

          <button
            onClick={handleStart}
            className="mt-4 text-text-dim text-sm hover:text-text"
          >
            Skip for now
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-8">
        {ONBOARDING_STEPS.map((_, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-colors ${
              idx === currentStep ? 'bg-primary' : idx < currentStep ? 'bg-primary/50' : 'bg-surface-light'
            }`}
          />
        ))}
      </div>

      {/* Skip button */}
      <div className="flex justify-end px-4 pt-4">
        <button
          onClick={handleSkip}
          className="text-text-dim text-sm hover:text-text"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="text-center max-w-sm"
          >
            {/* Icon */}
            <div className={`w-24 h-24 mx-auto mb-8 rounded-3xl bg-surface flex items-center justify-center ${step.color}`}>
              <step.icon size={48} />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-semibold mb-4">{step.title}</h1>

            {/* Description */}
            <p className="text-text-dim leading-relaxed mb-6">{step.description}</p>

            {/* Highlight */}
            <div className={`inline-block px-4 py-2 rounded-full bg-surface-light ${step.color} text-sm font-medium`}>
              {step.highlight}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="px-6 pb-12">
        <button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-background font-semibold rounded-xl text-lg hover:opacity-90 transition-opacity"
        >
          {isLastStep ? "Let's Start!" : 'Continue'}
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};
