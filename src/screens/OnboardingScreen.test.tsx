import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingScreen } from './OnboardingScreen';
import { usePlayerStore } from '../store/playerStore';

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
});

describe('interactive onboarding', () => {
  it('leads Skip clearly to sign in (not into the game) and records completion', () => {
    const onComplete = vi.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to sign in' }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });

  it('changes the CTA after the player inspects a lock', () => {
    render(<OnboardingScreen onComplete={() => undefined} />);
    // Before inspection: CTA prompts to inspect and is disabled.
    const before = screen.getByRole('button', { name: /Tap a lock to continue/i });
    expect(before).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Continue$/i })).not.toBeInTheDocument();
    // Inspect the lock.
    fireEvent.click(screen.getByRole('button', { name: /Lock 1: Keypad/i }));
    // After inspection: CTA becomes "Continue" and is enabled; the old
    // "Tap a lock to continue" label is gone.
    const after = screen.getByRole('button', { name: /^Continue$/i });
    expect(after).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Tap a lock to continue/i })).not.toBeInTheDocument();
  });

  it('completes the interactive practice flow', async () => {
    const onComplete = vi.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Lock 1: Keypad/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    for (const node of [1, 2, 3]) fireEvent.click(await screen.findByRole('button', { name: `Pattern node ${node}` }));
    fireEvent.click(await screen.findByRole('button', { name: /See the breach/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Learn the risk/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue to sign in/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });

  it('uses plain player language — no backend/engineering jargon', () => {
    const { container } = render(<OnboardingScreen onComplete={() => undefined} />);
    // Walk through every step and assert no banned phrases appear.
    const banned = [
      /verified mechanical sequence/i,
      /persistent multiplayer state/i,
      /not an invented reward/i,
      /AI output is validated/i,
    ];
    const clickNext = (name: RegExp) => {
      const btn = screen.queryByRole('button', { name });
      if (btn) fireEvent.click(btn);
    };
    fireEvent.click(screen.getByRole('button', { name: /Lock 1: Keypad/i }));
    clickNext(/^Continue$/i);
    for (const node of [1, 2, 3]) {
      const n = screen.queryByRole('button', { name: `Pattern node ${node}` });
      if (n) fireEvent.click(n);
    }
    clickNext(/See the breach/i);
    // "settlement" must not be the primary result label in the breach copy.
    expect(container.textContent || '').not.toMatch(/reveals a settlement/i);
    clickNext(/Learn the risk/i);
    for (const re of banned) expect(container.textContent || '').not.toMatch(re);
  });

  it('keeps a returning player marked complete after the tutorial unmounts', () => {
    const { unmount } = render(<OnboardingScreen onComplete={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to sign in' }));
    unmount();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });
});
