import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render crashes so Capture (and the rest of the app) never dies as a blank white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell flex min-h-dvh flex-col items-start justify-center gap-4">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            {this.state.error.message || 'The page crashed. You can try again without losing your queued photos.'}
          </p>
          <button
            type="button"
            className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/capture');
            }}
          >
            Back to Capture
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
