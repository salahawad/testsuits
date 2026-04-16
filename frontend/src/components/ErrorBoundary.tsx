import { Component, ErrorInfo, ReactNode } from "react";
import i18n from "../i18n";
import { logger } from "../lib/logger";

type Props = { children: ReactNode; fallback?: (reset: () => void, err: Error) => ReactNode };
type State = { error: Error | null };

/**
 * Last-resort boundary for render-time errors. Without this, a thrown error in
 * any page component produces a blank white screen; here we log via the shared
 * logger (so the browser console + prod beacon both fire) and offer a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("ErrorBoundary caught a render error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.reset, this.state.error);
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="card p-8 max-w-lg text-center space-y-3">
            <h1 className="text-2xl font-bold text-red-600">{i18n.t("errors.boundary_title")}</h1>
            <p className="text-sm text-slate-600">
              {i18n.t("errors.boundary_body")}
            </p>
            <pre className="text-xs text-slate-500 dark:text-slate-400 text-left bg-slate-50 dark:bg-slate-800 p-3 rounded overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2 justify-center">
              <button className="btn-secondary" onClick={() => window.location.reload()}>{i18n.t("errors.reload")}</button>
              <button className="btn-primary" onClick={this.reset}>{i18n.t("errors.try_again")}</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
