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

export const wrapWithCrashReporting = Sentry.wrap;
