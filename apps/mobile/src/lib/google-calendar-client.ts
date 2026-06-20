import { mobileApiFetch } from "@/lib/mobile-api";

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  hasGoogleAccount: boolean;
  scopes: string[];
};

export type GoogleCalendarDayEvent = {
  id: string;
  title: string;
  description: string | null;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  allDay: boolean;
};

export type GoogleCalendarEventsResponse = {
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  events: GoogleCalendarDayEvent[];
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

export const fetchGoogleCalendarEvents = ({
  timeMax,
  timeMin,
  timeZone,
}: {
  timeMax: string;
  timeMin: string;
  timeZone?: string | null;
}): Promise<GoogleCalendarEventsResponse> => {
  const params = new URLSearchParams({ timeMax, timeMin });
  if (timeZone) params.set("timeZone", timeZone);

  return mobileApiFetch(
    `/api/google-calendar/events?${params.toString()}`,
  ).then((response) => parseResponse<GoogleCalendarEventsResponse>(response));
};

export function getLocalTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
