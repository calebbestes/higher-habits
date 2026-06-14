import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: __DEV__ ? "development" : "production",
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

type CrashContext = Record<
  string,
  boolean | number | string | null | undefined
>;

export function addCrashBreadcrumb(message: string, data?: CrashContext): void {
  Sentry.addBreadcrumb({
    category: "app",
    data,
    level: "info",
    message,
  });
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
