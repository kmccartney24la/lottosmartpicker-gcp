// src/components/ErrorBoundary.tsx
'use client'
import React from 'react';

type Props = {
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

type State = { hasError: boolean; err?: unknown };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, err };
  }

  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('UI ErrorBoundary caught error:', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border p-4 text-sm">
          <div className="font-medium mb-1">Something went wrong.</div>
          <button
            className="mt-1 rounded bg-black text-white px-3 py-1"
            onClick={() => this.setState({ hasError: false, err: undefined })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
