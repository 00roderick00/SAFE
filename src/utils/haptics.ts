// Haptic Feedback Utility - Robinhood-style tactile responses
// Uses the Vibration API where available

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection';

// Vibration patterns (in milliseconds)
const PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 20], // Short pause long
  error: [30, 50, 30, 50, 30], // Triple buzz
  warning: [20, 30, 20], // Double tap
  selection: 5,
};

// Check if haptics are supported
export function supportsHaptics(): boolean {
  return 'vibrate' in navigator;
}

// Trigger haptic feedback
export function haptic(type: HapticType = 'light'): void {
  if (!supportsHaptics()) return;

  try {
    const pattern = PATTERNS[type];
    navigator.vibrate(pattern);
  } catch (e) {
    // Silently fail - haptics are not critical
  }
}

// Convenience functions for common interactions
export const haptics = {
  // Light tap for scrubbing graphs, selecting items
  light: () => haptic('light'),

  // Medium tap for button presses
  medium: () => haptic('medium'),

  // Heavy tap for important actions
  heavy: () => haptic('heavy'),

  // Success feedback for completed transactions
  success: () => haptic('success'),

  // Error feedback for failed actions
  error: () => haptic('error'),

  // Warning feedback
  warning: () => haptic('warning'),

  // Selection change
  selection: () => haptic('selection'),

  // Custom pattern
  custom: (pattern: number | number[]) => {
    if (!supportsHaptics()) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Silently fail
    }
  },

  // Cancel any ongoing vibration
  cancel: () => {
    if (!supportsHaptics()) return;
    try {
      navigator.vibrate(0);
    } catch (e) {
      // Silently fail
    }
  },
};

// React hook for haptic feedback
import { useCallback } from 'react';

export function useHaptics() {
  const trigger = useCallback((type: HapticType = 'light') => {
    haptic(type);
  }, []);

  return {
    trigger,
    light: useCallback(() => haptics.light(), []),
    medium: useCallback(() => haptics.medium(), []),
    heavy: useCallback(() => haptics.heavy(), []),
    success: useCallback(() => haptics.success(), []),
    error: useCallback(() => haptics.error(), []),
    warning: useCallback(() => haptics.warning(), []),
    selection: useCallback(() => haptics.selection(), []),
    supported: supportsHaptics(),
  };
}

export default haptics;
