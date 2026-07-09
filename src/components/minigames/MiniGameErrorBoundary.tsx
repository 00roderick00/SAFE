import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MiniGameResult, ModuleType } from '../../types';

interface Props {
  moduleType: ModuleType;
  moduleId: string;
  onFail: (result: MiniGameResult) => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Catches render/runtime errors thrown by an individual minigame so the
 * whole app doesn't crash. Reports a failed MiniGameResult to the caller
 * once, then renders a fallback UI until the caller advances state.
 */
export class MiniGameErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };
  private hasReported = false;

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[MiniGameErrorBoundary]', this.props.moduleType, error, info);
    }
    if (!this.hasReported) {
      this.hasReported = true;
      this.props.onFail({
        moduleId: this.props.moduleId,
        moduleType: this.props.moduleType,
        score: 0,
        passed: false,
        timeSpent: 0,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-sm mx-auto text-center py-8">
          <AlertTriangle size={56} className="text-danger mx-auto mb-4" />
          <p className="font-display text-lg font-bold text-danger mb-2">Lock malfunction</p>
          <p className="text-sm text-text-dim">
            The <span className="text-text">{this.props.moduleType}</span> module failed to load.
            Counting as a failed lock.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
