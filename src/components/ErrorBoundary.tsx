import React from 'react';

type Props = {
  children: React.ReactNode;
  onRecover?: () => void;
};

type State = {
  hasError: boolean;
  error?: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log to console for now — could integrate with a logging service
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mb-4">The form failed to load. You can close and try again.</p>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-muted"
              onClick={() => this.props.onRecover && this.props.onRecover()}
            >
              Close
            </button>
            <button
              className="px-3 py-1 rounded bg-secondary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary>Error details</summary>
            <pre className="whitespace-pre-wrap">{String(this.state.error)}</pre>
          </details>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
