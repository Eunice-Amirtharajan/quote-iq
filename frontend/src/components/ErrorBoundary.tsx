import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** A change (e.g. the route path) clears a caught error, so navigating away recovers */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

/**
 * Catches render errors below it so one crashing page shows a retry panel instead of
 * unmounting the whole app. Error boundaries still have to be class components.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  private readonly retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" role="alert">
        <p className="text-sm text-gray-500">Something went wrong on this page.</p>
        <button
          type="button"
          onClick={this.retry}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Try again
        </button>
      </div>
    );
  }
}
