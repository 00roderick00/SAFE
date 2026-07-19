import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from './store/playerStore';

const sessionState = vi.hoisted(() => ({ value: null as undefined | null | { user: { id: string } } }));

vi.mock('./services/useSession', () => ({ useSession: () => sessionState.value }));
vi.mock('./services/useHydrateFromServer', () => ({ useHydrateFromServer: () => undefined }));

import App from './App';

beforeEach(() => {
  usePlayerStore.getState().resetPlayer();
  sessionState.value = null;
  window.history.replaceState({}, '', '/');
});

describe('application authentication boundary QA', () => {
  it('teaches the game before requiring authentication', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Skip tutorial' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('takes returning signed-out players directly to authentication', () => {
    usePlayerStore.setState({ onboardingCompleted: true });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'SAFE' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('keeps the loading boundary while session state is unresolved', () => {
    usePlayerStore.setState({ onboardingCompleted: true });
    sessionState.value = undefined;
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Initializing secure channel');
  });

  it('limits credential-free visual QA access to the development-only query', async () => {
    window.history.replaceState({}, '', '/?visualQa=1');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Command vault' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
