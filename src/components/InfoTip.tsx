// Tap-first explanatory help.
//
// MOBILE-FIRST CONTRACT: this game is played on phones, where hover and
// native `title` tooltips DO NOT EXIST. So the primary interaction is
// TAP — hover and focus are conveniences layered on top for desktop and
// keyboard. Never explain a number with a `title` attribute.
//
// Accessibility: a real <button> with aria-expanded/aria-controls (the
// standard disclosure pattern), so screen readers announce that help is
// available and can open it. The panel is a labelled note, and the
// button keeps an aria-label naming what it explains, so it is never
// just an unlabelled "i".
//
// Dismisses on tap-outside, Escape, or a second tap.

import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  /** What this explains, e.g. "Balance" — used in the button label. */
  label: string;
  /** One or two short sentences. Sourced from game/statHelp.ts. */
  body: string;
  /** Nudge the panel when the tip sits near a screen edge. */
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export const InfoTip = ({ label, body, align = 'center', className = '' }: InfoTipProps) => {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  /** Flip below the trigger when there isn't room above it. */
  const [below, setBelow] = useState(false);
  /** A tap "pins" the panel so a stray pointer-leave can't close it. */
  const pinnedRef = useRef(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  /** Decide placement from the trigger's position before revealing, so
   *  a tip near the top of the screen isn't clipped off-viewport. */
  const openWithPlacement = (next: boolean) => {
    if (next) {
      const rect = rootRef.current?.getBoundingClientRect();
      setBelow(!!rect && rect.top < 150);
    }
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        pinnedRef.current = false;
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pinnedRef.current = false;
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span className={`info-tip ${className}`} ref={rootRef}>
      <button
        type="button"
        className="info-tip__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`What is ${label}?`}
        onClick={() => {
          // Pin-then-close, NOT a plain toggle: on desktop the panel may
          // already be open from hover, and a plain toggle would make
          // clicking it close — so the first click pins it open and only
          // a click on an already-pinned panel closes.
          if (pinnedRef.current) {
            pinnedRef.current = false;
            openWithPlacement(false);
          } else {
            pinnedRef.current = true;
            openWithPlacement(true);
          }
        }}
        // Hover/focus are ADDITIVE for desktop + keyboard. Guarded on
        // pointerType so a touch tap doesn't fire a synthetic hover that
        // fights the click handler.
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') openWithPlacement(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !pinnedRef.current) setOpen(false); }}
        onFocus={() => openWithPlacement(true)}
        onBlur={() => { if (!pinnedRef.current) setOpen(false); }}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      {/* Rendered only while open: a `hidden` panel still contributes to
          textContent, which silently corrupts any assertion (or reader)
          that reads a stat row as "label + value". */}
      {open && (
        <span
          id={panelId}
          role="note"
          aria-label={`${label} explained`}
          className={`info-tip__panel info-tip__panel--${align}${below ? ' info-tip__panel--below' : ''}`}
        >
          {body}
        </span>
      )}
    </span>
  );
};
