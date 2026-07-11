import { createElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MiniGameResult, ModuleType } from '../../types';
import { getMiniGameComponent } from './registry';
import { MiniGameErrorBoundary } from './MiniGameErrorBoundary';

interface Props {
  moduleType: ModuleType;
  moduleId: string;
  difficulty: number;
  seed: string;
  /** AI-generated engine config for custom-game modules; passed
   *  through to the engine which reads any fields it supports and
   *  ignores the rest. */
  config?: unknown;
  onComplete: (result: MiniGameResult) => void;
  onFail: (result: MiniGameResult) => void;
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
  onComplete,
  onFail,
}: Props) => {
  const Component = getMiniGameComponent(moduleType);

  if (!Component) {
    return (
      <div className="text-center py-8">
        <AlertTriangle size={56} className="text-warning mx-auto mb-4" />
        <p className="font-display text-lg font-bold text-warning mb-2">Unknown module</p>
        <p className="text-sm text-text-dim mb-4">
          No minigame is registered for type
          <span className="text-text"> {moduleType}</span>. Counting as a failed lock.
        </p>
        <button
          onClick={() =>
            onComplete({
              moduleId,
              moduleType,
              score: 0,
              passed: false,
              timeSpent: 0,
            })
          }
          className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium"
        >
          Continue
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
      {createElement(Component, { difficulty, seed, config, onComplete })}
    </MiniGameErrorBoundary>
  );
};
