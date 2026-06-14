import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Popup crashed', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 p-4 text-sm text-rose-100">
          <div className="rounded-md border border-rose-500/30 bg-rose-950/60 p-4">
            <div className="font-semibold">Popup error</div>
            <div className="mt-2 text-rose-200">{this.state.error}</div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
