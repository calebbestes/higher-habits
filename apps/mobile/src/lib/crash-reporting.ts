import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  enableNative: true,
  enableNativeCrashHandling: true,
  environment: __DEV__ ? "development" : "production",
  maxBreadcrumbs: 150,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

type CrashContext = Record<
  string,
  boolean | number | string | null | undefined
>;

type CrashBreadcrumbLevel = "debug" | "info" | "warning" | "error";

export function addCrashBreadcrumb(
  message: string,
  data?: CrashContext,
  level: CrashBreadcrumbLevel = "info",
): void {
  Sentry.addBreadcrumb({
    category: "app",
    data,
    level,
    message,
  });
}

export function setCrashContext(name: string, context: CrashContext | null) {
  Sentry.setContext(name, context);
}

export function captureHandledError(
  error: unknown,
  context?: CrashContext,
): void {
  const exception =
    error instanceof Error
      ? error
      : new Error(String(error ?? "Unknown error"));

  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(exception);
  });
}

export function setCrashReportingUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Wraps an event handler so that a breadcrumb is dropped every time it runs and
 * any synchronous throw is reported to Sentry (tagged with the handler name and
 * the surrounding component) before being re-thrown. Async handlers report
 * rejections too.
 */
export function traceHandler<A extends unknown[], R>(
  name: string,
  handler: (...args: A) => R,
  data?: CrashContext,
): (...args: A) => R {
  return (...args: A): R => {
    addCrashBreadcrumb(`Handler: ${name}`, data);
    try {
      const result = handler(...args);
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          captureHandledError(error, {
            ...data,
            handler: name,
            phase: "handler",
          });
          throw error;
        }) as R;
      }
      return result;
    } catch (error) {
      captureHandledError(error, { ...data, handler: name, phase: "handler" });
      throw error;
    }
  };
}

export const wrapWithCrashReporting = Sentry.wrap;
