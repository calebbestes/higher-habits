import { mobileApiFetch } from "@/lib/mobile-api";

type DiagnosticValue = boolean | number | string | null | undefined;

export function reportMobileDiagnostic(
  event: string,
  details: Record<string, DiagnosticValue> = {},
): void {
  void mobileApiFetch("/api/mobile-diagnostics", {
    method: "POST",
    body: JSON.stringify({ details, event }),
  }).catch(() => undefined);
}
