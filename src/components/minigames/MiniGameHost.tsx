import { createElement, Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MiniGameResult, ModuleType } from '../../types';
import { getMiniGameComponent } from './registry';
import { MiniGameErrorBoundary } from './MiniGameErrorBoundary';
import { DslRunner } from './DslRunner';

interface Props {
  moduleType: ModuleType;
  moduleId: string;
  difficulty: number;
  seed: string;
  /** AI-generated engine config for custom-game modules; passed
   *  through to the engine which reads any fields it supports and
   *  ignores the rest. */
  config?: unknown;
  /** When set to 'dsl_program', the DSL runtime renders the game
   *  from `config`, bypassing the engine registry. */
  mode?: 'engine_config' | 'dsl_program';
  onComplete: (result: MiniGameResult) => void;
  onFail: (result: MiniGameResult) => void;
  /** Raised when no component exists for `moduleType` (server/client
   *  version skew). The attack is voided and the stake refunded — this
   *  is never scored as a failed lock. */
  onUnsupported?: (info: { moduleId: string; moduleType: ModuleType }) => void;
}

/**
 * Looks up the minigame component for `moduleType` and renders it wrapped
 * in an error boundary. Owning the registry lookup here (rather than in
 * screens) keeps callers rendering a single stable component type,
 * dodging the react-hooks "component created during render" warning that
 * fires when JSX references a component held in a local variable.
 */
export const MiniGameHost = ({
  moduleType,
  moduleId,
  difficulty,
  seed,
  config,
  mode,
  onComplete,
  onFail,
  onUnsupported,
}: Props) => {
  // Phase 3B: DSL games render through a fixed interpreter, not
  // through one of the built-in engine components.
  if (mode === 'dsl_program') {
    return (
      <MiniGameErrorBoundary moduleType={moduleType} moduleId={moduleId} onFail={onFail}>
        <DslRunner difficulty={difficulty} seed={seed} config={config} onComplete={onComplete} />
      </MiniGameErrorBoundary>
    );
  }

  const Component = getMiniGameComponent(moduleType);

  if (!Component) {
    // Version skew: the server dealt a lock this build has no component
    // for. This is OUR bug, not the player's — so it must never be
    // scored as a failed lock (which, under all-or-nothing, would burn
    // their whole stake). The attack is voided and the stake refunded
    // server-side; submit_result reaches the same verdict from its own
    // loadout snapshot, so a forged client can't turn this into a free
    // breach — a void pays zero loot. See PROGRESS-TACTILE.md §7.
    return (
      <div className="text-center py-8">
        <AlertTriangle size={56} className="text-warning mx-auto mb-4" />
        <p className="font-display text-lg font-bold text-warning mb-2">This lock couldn’t load</p>
        <p className="text-sm text-text-dim mb-4">
          Your app is out of date for lock type
          <span className="text-text"> {moduleType}</span>. The raid is void and your stake is
          returned — nothing is lost. Reload to get the latest version.
        </p>
        <button
          onClick={() => onUnsupported?.({ moduleId, moduleType })}
          className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium"
        >
          End raid &amp; refund stake
        </button>
      </div>
    );
  }

  // Using createElement rather than JSX so the lookup is expressed as a
  // function call. Linter cannot prove that Component (from a
  // module-scoped registry keyed on moduleType) is stable, so JSX
  // dispatch trips its "component created during render" heuristic.
  return (
    <MiniGameErrorBoundary moduleType={moduleType} moduleId={moduleId} onFail={onFail}>
      <Suspense fallback={<div className="minigame-loading" role="status"><span />Loading lock mechanism…</div>}>
        {createElement(Component, { difficulty, seed, config, onComplete })}
      </Suspense>
    </MiniGameErrorBoundary>
  );
};
