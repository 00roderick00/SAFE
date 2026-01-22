// Custom Game Suggestion Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CustomGameSuggestion } from '../types';

interface CustomGameStore {
  suggestions: CustomGameSuggestion[];

  // Actions
  addSuggestion: (name: string, description: string, mechanics: string) => CustomGameSuggestion;
  rateSuggestion: (id: string, rating: CustomGameSuggestion['aiRating']) => void;
  updateStatus: (id: string, status: CustomGameSuggestion['status']) => void;
  removeSuggestion: (id: string) => void;
  clearAllSuggestions: () => void;
}

// Simulated AI rating function - in production this would call an actual AI service
const generateAIRating = (
  name: string,
  description: string,
  mechanics: string
): CustomGameSuggestion['aiRating'] => {
  // Simple heuristics for demo purposes
  const wordCount = mechanics.split(' ').length;
  const hasTimeElement = /time|timer|seconds|fast|quick/i.test(mechanics);
  const hasScoreElement = /score|point|count|collect/i.test(mechanics);
  const hasClearObjective = /win|goal|complete|finish|reach/i.test(mechanics);

  // Calculate feasibility based on clarity of description
  const feasibility = Math.min(1, (
    (wordCount > 10 ? 0.3 : 0.1) +
    (hasTimeElement ? 0.2 : 0) +
    (hasScoreElement ? 0.2 : 0) +
    (hasClearObjective ? 0.3 : 0)
  ));

  // Estimate difficulty based on complexity keywords
  const isComplex = /physics|3d|multiplayer|ai|procedural/i.test(mechanics);
  const difficulty = isComplex ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4;

  // Generate feedback
  const feedbackParts: string[] = [];

  if (feasibility > 0.7) {
    feedbackParts.push('This game concept is clear and implementable.');
  } else if (feasibility > 0.4) {
    feedbackParts.push('The concept has potential but could use more detail.');
  } else {
    feedbackParts.push('Please provide more specific gameplay mechanics.');
  }

  if (!hasTimeElement) {
    feedbackParts.push('Consider adding a time-based element for security purposes.');
  }

  if (!hasScoreElement) {
    feedbackParts.push('A scoring system would help determine breach success.');
  }

  if (isComplex) {
    feedbackParts.push('Note: Complex features may be simplified for implementation.');
  }

  return {
    difficulty,
    feasibility,
    estimatedTime: feasibility > 0.6 ? '15-30 seconds' : '20-45 seconds',
    feedback: feedbackParts.join(' '),
  };
};

export const useCustomGameStore = create<CustomGameStore>()(
  persist(
    (set, get) => ({
      suggestions: [],

      addSuggestion: (name, description, mechanics) => {
        const newSuggestion: CustomGameSuggestion = {
          id: `suggestion-${Date.now()}`,
          name,
          description,
          mechanics,
          suggestedAt: Date.now(),
          aiRating: null,
          status: 'pending',
        };

        set((state) => ({
          suggestions: [newSuggestion, ...state.suggestions],
        }));

        // Simulate AI rating after a short delay
        setTimeout(() => {
          const rating = generateAIRating(name, description, mechanics);
          get().rateSuggestion(newSuggestion.id, rating);
        }, 1500);

        return newSuggestion;
      },

      rateSuggestion: (id, rating) =>
        set((state) => ({
          suggestions: state.suggestions.map((s) =>
            s.id === id
              ? { ...s, aiRating: rating, status: rating && rating.feasibility > 0.6 ? 'approved' : 'rated' }
              : s
          ),
        })),

      updateStatus: (id, status) =>
        set((state) => ({
          suggestions: state.suggestions.map((s) =>
            s.id === id ? { ...s, status } : s
          ),
        })),

      removeSuggestion: (id) =>
        set((state) => ({
          suggestions: state.suggestions.filter((s) => s.id !== id),
        })),

      clearAllSuggestions: () => set({ suggestions: [] }),
    }),
    {
      name: 'safe-custom-games-storage',
    }
  )
);
