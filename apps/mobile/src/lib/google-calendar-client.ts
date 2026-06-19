import { mobileApiFetch } from "@/lib/mobile-api";

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  hasGoogleAccount: boolean;
  scopes: string[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Unable to continue.");
  }

  return response.json() as Promise<T>;
}

export const fetchGoogleCalendarStatus = (): Promise<GoogleCalendarStatus> =>
  mobileApiFetch("/api/google-calendar/status").then((response) =>
    parseResponse<GoogleCalendarStatus>(response),
  );

export function getLocalTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
