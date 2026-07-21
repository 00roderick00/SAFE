import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VaultOutcome } from './VaultOutcome';

const props = { target: 'Vault 07', stake: 40, grossLoot: 220, platformFee: 22, netLoot: 198 };

describe('VaultOutcome vault-event choreography', () => {
  it('reveals the interior token chamber and loot transfer on a win', () => {
    const { container } = render(<VaultOutcome success {...props} />);
    expect(screen.getByRole('heading', { name: 'You won 198 TK' })).toBeInTheDocument();
    expect(container.querySelector('.outcome-vault--open')).not.toBeNull();
    expect(container.querySelector('.outcome-vault__chamber')).not.toBeNull();
    expect(container.querySelectorAll('.chamber-coin').length).toBeGreaterThan(0);
    expect(container.querySelector('.outcome-loot-stream')).not.toBeNull();
  });

  it('keeps the vault sealed with no chamber or loot on a loss', () => {
    const { container } = render(<VaultOutcome success={false} {...props} />);
    expect(screen.getByRole('heading', { name: 'You lost 40 TK' })).toBeInTheDocument();
    expect(container.querySelector('.outcome-vault--open')).toBeNull();
    expect(container.querySelector('.outcome-vault__chamber')).toBeNull();
    expect(container.querySelector('.outcome-loot-stream')).toBeNull();
  });

  it('explains a forfeited stake when the run was abandoned', () => {
    render(<VaultOutcome success={false} abandoned {...props} />);
    expect(screen.getByText('Attack abandoned')).toBeInTheDocument();
    expect(screen.getByText('STAKE FORFEITED')).toBeInTheDocument();
  });
});
