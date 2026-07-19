import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateBadge, StateFrame } from './VisualState';

describe('visual state system', () => {
  it('names state independently from color', () => {
    render(<StateBadge state="breached" />);
    expect(screen.getByText('Breached')).toBeInTheDocument();
    expect(screen.getByText('Breached').closest('[data-state]')).toHaveAttribute('data-state', 'breached');
  });

  it('exposes a labeled state frame', () => {
    render(<StateFrame state="secure" label="Vault status"><span>Online</span></StateFrame>);
    expect(screen.getByRole('region', { name: 'Vault status' })).toHaveAttribute('data-state', 'secure');
  });
});
