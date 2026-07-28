// Locked-state UI for a progressively-disclosed surface (§3).
//
// Two presentations, one source of copy:
//   - `LockedSurfaceScreen` — route guard target. A tier-0 account that
//     deep-links /security gets this instead of the real screen.
//   - `LockedSurfaceSheet` — the tap-to-reveal sheet behind a locked
//     bottom-nav item, because a `title` tooltip is invisible on touch.
//
// PRESENTATION ONLY. This never gates a server capability — a direct
// API caller can hit any endpoint at any tier (see PROGRESS-SECURITY.md).

import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  progressToward,
  requirementFor,
  SURFACE_LABELS,
  SURFACE_PITCH,
  type GatedSurface,
} from '../game/progression';
import { usePlayerStore } from '../store/playerStore';

function useLockCopy(surface: GatedSurface) {
  const completedHeists = usePlayerStore((s) => s.completedHeists);
  const successfulHeists = usePlayerStore((s) => s.successfulHeists);
  const progress = progressToward(surface, { completedHeists, successfulHeists });
  return {
    name: SURFACE_LABELS[surface],
    pitch: SURFACE_PITCH[surface],
    requirement: requirementFor(surface),
    progress,
  };
}

/** Compact locked explainer, shown when a locked nav item is tapped. */
export const LockedSurfaceSheet = ({ surface, onClose }: { surface: GatedSurface; onClose: () => void }) => {
  const { name, pitch, requirement, progress } = useLockCopy(surface);
  const navigate = useNavigate();
  return (
    // Plain CSS animation rather than framer-motion: a stuck animation
    // frame here leaves the explainer half-transparent and unreadable,
    // and this sheet is the ONLY way a touch player can discover why a
    // nav item is locked. It must always render at full opacity.
    <div
      className="locked-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label={`${name} is locked`}
    >
      <div
        className="locked-sheet w-full max-w-md m-3 mb-24 p-5 rounded-xl border border-surface-light bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <Lock size={18} className="text-warning" aria-hidden="true" />
          <p className="font-display text-base font-bold text-text">{name} is locked</p>
        </div>
        <p className="text-sm text-text-dim">{pitch}</p>
        <p className="text-sm text-text mt-3">
          <span className="text-warning font-medium">{requirement}</span> to unlock.
        </p>
        <p className="text-xs text-text-dim mt-1">{progress.label}</p>
        <div className="flex gap-2 mt-4">
          <button className="btn-neon flex-1" onClick={() => { onClose(); navigate('/heist'); }}>
            Start a heist
          </button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/** Full locked screen — what a deep link to a gated route renders. */
export const LockedSurfaceScreen = ({ surface }: { surface: GatedSurface }) => {
  const { name, pitch, requirement, progress } = useLockCopy(surface);
  const navigate = useNavigate();
  const pct = Math.round((progress.current / progress.needed) * 100);
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16" role="region" aria-label={`${name} is locked`}>
      <div className="relative mb-5">
        <div className="w-20 h-20 rounded-full border border-surface-light flex items-center justify-center">
          <Lock size={32} className="text-warning" aria-hidden="true" />
        </div>
      </div>
      <p className="eyebrow">LOCKED</p>
      <h1 className="font-display text-2xl font-bold text-text mt-1">{name} is locked</h1>
      <p className="text-sm text-text-dim mt-3 max-w-sm">{pitch}</p>

      <div className="w-full max-w-sm mt-6 p-4 rounded-lg border border-surface-light">
        <p className="text-sm text-text">
          <span className="text-warning font-medium">{requirement}</span> to unlock.
        </p>
        <div className="h-1.5 rounded-full bg-surface-light mt-3 overflow-hidden" role="progressbar" aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.needed}>
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-text-dim mt-2">{progress.label}</p>
      </div>

      <div className="flex gap-2 mt-6">
        <button className="btn-neon" onClick={() => navigate('/heist')}>Start a heist</button>
        <button className="btn-secondary" onClick={() => navigate('/')}>Back to safe</button>
      </div>
    </div>
  );
};
