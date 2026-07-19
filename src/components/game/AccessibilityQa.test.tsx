import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SecurityModule } from '../../types';
import { SafeGraphic } from '../SafeGraphic';
import { MiniGameChrome } from '../minigames/MiniGameChrome';
import { BreachHud } from './BreachHud';

const locks: SecurityModule[] = [
  { id: 'a', type: 'pattern', name: 'Pattern Lock', description: '', difficulty: .4, weight: 1 },
  { id: 'b', type: 'tetris', name: 'Tetris', description: '', difficulty: .5, weight: 1 },
  { id: 'c', type: 'safedial', name: 'Safe Dial', description: '', difficulty: .6, weight: 1 },
];

describe('game presentation accessibility QA', () => {
  it.each([
    ['secure', 'Vault secure'],
    ['exposed', 'Vault exposed to attacks'],
    ['attacking', 'Vault currently under attack'],
    ['breached', 'Vault breached'],
    ['recovering', 'Vault recovering'],
  ] as const)('labels the %s home-vault presentation without color alone', (state, label) => {
    render(<SafeGraphic state={state} />);
    expect(screen.getByRole('group', { name: label })).toHaveClass(`tactical-vault--${state}`);
  });

  it('keeps interactive vault locks exposed inside a labeled group', () => {
    render(<SafeGraphic state="secure" balance={2_500} locks={locks} />);
    expect(screen.getByRole('group', { name: /Vault secure with 2,500 tokens/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Lock \d:/i })).toHaveLength(3);
  });

  it('exposes breach and minigame completion as progress bars', () => {
    render(<>
      <BreachHud
        target="Test Vault"
        stake={40}
        netLoot={180}
        current={2}
        total={3}
        timeLeft={25}
        progress={34}
        locks={locks.map((lock, index) => ({ ...lock, status: index === 0 ? 'cracked' : index === 1 ? 'active' : 'pending' }))}
      />
      <MiniGameChrome
        name="QA Lock"
        objective="Complete the sequence"
        timeLeft={20}
        progress={{ current: 2, total: 5, label: 'Nodes' }}
        status="Continue"
        controls={<button>Move</button>}
      ><div>Playfield</div></MiniGameChrome>
    </>);
    expect(screen.getByRole('progressbar', { name: 'Overall breach progress' })).toHaveAttribute('aria-valuenow', '34');
    expect(screen.getByRole('progressbar', { name: 'Nodes progress' })).toHaveAttribute('aria-valuenow', '2');
  });
});
