import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingScreen } from './OnboardingScreen';
import { usePlayerStore } from '../store/playerStore';

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
});

describe('interactive onboarding', () => {
  it('can be skipped and records completion', () => {
    const onComplete = vi.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });

  it('completes the interactive practice flow', async () => {
    const onComplete = vi.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Lock 1: Pattern Lock/i }));
    fireEvent.click(screen.getByRole('button', { name: /Inspect a lock to continue/i }));
    for (const node of [1, 2, 3]) fireEvent.click(await screen.findByRole('button', { name: `Pattern node ${node}` }));
    fireEvent.click(await screen.findByRole('button', { name: /See the breach/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Learn the risk/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Enter SAFE/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });

  it('keeps a returning player marked complete after the tutorial unmounts', () => {
    const { unmount } = render(<OnboardingScreen onComplete={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    unmount();
    expect(usePlayerStore.getState().onboardingCompleted).toBe(true);
  });
});
