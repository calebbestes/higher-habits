import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";

import { addCrashBreadcrumb, captureHandledError } from "@/lib/crash-reporting";

type Props = {
  /** Human-readable component name reported to Sentry on a render failure. */
  name: string;
  children: ReactNode;
  /** Rendered in place of the children after a caught error. Defaults to null. */
  fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * Catches render/lifecycle errors thrown by its children and reports them to
 * Sentry tagged with the component `name` and the React component stack, so a
 * crash points at the exact component instead of taking down the whole screen.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    addCrashBreadcrumb(
      `Render failed in ${this.props.name}`,
      { component: this.props.name },
      "error",
    );
    captureHandledError(error, {
      component: this.props.name,
      componentStack: info.componentStack ?? undefined,
      phase: "render",
    });
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * Wraps a component in its own {@link ComponentErrorBoundary}. Any render error
 * thrown by `WrappedComponent` is caught and reported with `name`.
 */
export function withErrorTrace<P extends object>(
  WrappedComponent: ComponentType<P>,
  name: string,
): ComponentType<P> {
  function TracedComponent(props: P) {
    return (
      <ComponentErrorBoundary name={name}>
        <WrappedComponent {...props} />
      </ComponentErrorBoundary>
    );
  }
  TracedComponent.displayName = `Traced(${name})`;
  return TracedComponent;
}
