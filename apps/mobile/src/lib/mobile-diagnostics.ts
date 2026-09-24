import { mobileApiFetch } from "@/lib/mobile-api";

type DiagnosticValue = boolean | number | string | null | undefined;

const DIAGNOSTIC_WINDOW_MS = 10_000;
const MAX_DIAGNOSTICS_PER_WINDOW = 20;
const MIN_REPEAT_INTERVAL_MS = 250;
let diagnosticWindowStartedAt = 0;
let diagnosticsInWindow = 0;
const lastDiagnosticAtByKey = new Map<string, number>();

export function reportMobileDiagnostic(
  event: string,
  details: Record<string, DiagnosticValue> = {},
): void {
  const now = Date.now();
  if (now - diagnosticWindowStartedAt >= DIAGNOSTIC_WINDOW_MS) {
    diagnosticWindowStartedAt = now;
    diagnosticsInWindow = 0;
    lastDiagnosticAtByKey.clear();
  }

  const key = `${event}:${JSON.stringify(details)}`;
  const lastDiagnosticAt = lastDiagnosticAtByKey.get(key) ?? 0;
  if (
    diagnosticsInWindow >= MAX_DIAGNOSTICS_PER_WINDOW ||
    now - lastDiagnosticAt < MIN_REPEAT_INTERVAL_MS
  ) {
    return;
  }

  lastDiagnosticAtByKey.set(key, now);
  diagnosticsInWindow += 1;
  void mobileApiFetch("/api/mobile-diagnostics", {
    method: "POST",
    body: JSON.stringify({ details, event }),
  }).catch(() => undefined);
}
