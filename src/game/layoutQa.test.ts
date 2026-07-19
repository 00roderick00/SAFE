import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

describe('responsive shell CSS contracts', () => {
  it('reserves independent space for the fixed action bar and navigation', () => {
    expect(css).toContain('bottom: calc(var(--safe-nav-height) + env(safe-area-inset-bottom));');
    expect(css).toContain('padding-bottom: calc(var(--safe-nav-height) + env(safe-area-inset-bottom));');
    expect(css).toContain('.app-canvas > div:has(.action-bar)');
    // Trailing padding must clear BOTH fixed layers (action bar + nav).
    expect(css).toContain('padding-bottom: calc(var(--safe-action-height) + var(--safe-nav-height) + 32px) !important;');
  });

  it('accounts for every safe-area edge and retains 44px interaction targets', () => {
    expect(css).toContain('padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);');
    expect(css).toContain('max(16px, env(safe-area-inset-right))');
    expect(css).toContain('max(16px, env(safe-area-inset-left))');
    expect(css).toMatch(/button,\s*a\[href\],\s*\[role='button'\]\s*\{\s*min-height: 44px;/);
  });

  it('constrains desktop gameplay and disables decorative motion when requested', () => {
    expect(css).toContain('--safe-content-width: 760px;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-duration: 0.001ms !important;');
    expect(css).toContain('transition-duration: 0.001ms !important;');
  });
});
