/**
 * InfoTip contract. The load-bearing requirement is that help is
 * reachable by TAP: this game is played on phones, where hover and
 * native `title` tooltips do not exist. Hover/focus are additive.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfoTip } from './InfoTip';

const setup = (body = 'Explanatory copy.') => {
  render(
    <div>
      <InfoTip label="Balance" body={body} />
      <button type="button">outside</button>
    </div>
  );
  return screen.getByRole('button', { name: 'What is Balance?' });
};

describe('reveals on tap', () => {
  it('is hidden until tapped, then shows the explanation', () => {
    const trigger = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('note', { name: 'Balance explained' });
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent('Explanatory copy.');
  });

  it('a second tap closes it', () => {
    const trigger = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a touch tap (pointerType: touch) opens it — no synthetic hover fight', () => {
    const trigger = setup();
    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument(); // touch hover is ignored
    fireEvent.click(trigger);
    expect(screen.getByRole('note')).toBeInTheDocument();
    // A stray pointer-leave must not close a tapped-open panel.
    fireEvent.pointerLeave(trigger, { pointerType: 'touch' });
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});

describe('dismissal', () => {
  it('closes on tap outside', () => {
    const trigger = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const trigger = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a tap inside the panel does not close it', () => {
    const trigger = setup();
    fireEvent.click(trigger);
    const panel = screen.getByRole('note');
    fireEvent.pointerDown(panel);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});

describe('desktop + keyboard affordances are additive, not required', () => {
  it('opens on mouse hover and closes on leave', () => {
    const trigger = setup();
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('opens on keyboard focus', () => {
    const trigger = setup();
    fireEvent.focus(trigger);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('a hover-opened panel stays open once tapped (pinned)', () => {
    const trigger = setup();
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.click(trigger); // pin
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('is a real button that names what it explains and wires aria-controls', () => {
    const trigger = setup();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).not.toBeDisabled();
    const controls = trigger.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.getByRole('note').id).toBe(controls);
  });

  it('NEVER uses a title attribute — invisible on touch', () => {
    const trigger = setup();
    expect(trigger).not.toHaveAttribute('title');
    fireEvent.click(trigger);
    expect(screen.getByRole('note')).not.toHaveAttribute('title');
  });

  it('does not require hover handlers to be usable', () => {
    // Simulate a device that never fires pointerenter at all.
    const trigger = setup();
    const spy = vi.fn();
    trigger.addEventListener('pointerenter', spy);
    fireEvent.click(trigger);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
