import { mobileApiFetch } from "@/lib/mobile-api";

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  hasCalendarMetadataReadScope: boolean;
  hasGoogleAccount: boolean;
  scopes: string[];
};

export type GoogleCalendarDayEvent = {
  backgroundColor?: string | null;
  colorId?: string | null;
  eventLabelId?: string | null;
  foregroundColor?: string | null;
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

export type CreateGoogleCalendarEventInput = {
  dateKey: string;
  description?: string | null;
  endTime?: string | null;
  startTime?: string | null;
  timeZone?: string | null;
  title: string;
};
export type UpdateGoogleCalendarEventInput = CreateGoogleCalendarEventInput & {
  allDay?: boolean;
  color?: string | null;
  eventLabelId?: string | null;
  eventId: string;
};

export type CreateGoogleCalendarEventResponse = {
  status: GoogleCalendarEventsResponse["status"];
  event?: GoogleCalendarDayEvent | null;
};
export type UpdateGoogleCalendarEventResponse =
  CreateGoogleCalendarEventResponse;
export type DeleteGoogleCalendarEventResponse = {
  status:
    | "deleted"
    | "skipped"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
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

export const disconnectGoogleCalendar = (): Promise<{
  disconnected: boolean;
}> =>
  mobileApiFetch("/api/google-calendar/disconnect", {
    method: "POST",
  }).then((response) => parseResponse<{ disconnected: boolean }>(response));

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

export const createGoogleCalendarEvent = ({
  dateKey,
  description,
  endTime,
  startTime,
  timeZone,
  title,
}: CreateGoogleCalendarEventInput): Promise<CreateGoogleCalendarEventResponse> =>
  mobileApiFetch("/api/google-calendar/events", {
    method: "POST",
    body: JSON.stringify({
      dateKey,
      description: description ?? null,
      plannedStartTime: startTime ?? null,
      plannedEndTime: endTime ?? null,
      plannedTimeZone: timeZone ?? null,
      title,
    }),
  }).then((response) =>
    parseResponse<CreateGoogleCalendarEventResponse>(response),
  );

export const updateGoogleCalendarEvent = ({
  allDay,
  color,
  dateKey,
  description,
  endTime,
  eventLabelId,
  eventId,
  startTime,
  timeZone,
  title,
}: UpdateGoogleCalendarEventInput): Promise<UpdateGoogleCalendarEventResponse> =>
  mobileApiFetch("/api/google-calendar/events", {
    method: "PATCH",
    body: JSON.stringify({
      dateKey,
      description: description ?? null,
      eventId,
      ...(allDay === undefined ? {} : { allDay }),
      ...(color === undefined ? {} : { color }),
      ...(eventLabelId === undefined ? {} : { eventLabelId }),
      plannedStartTime: startTime ?? null,
      plannedEndTime: endTime ?? null,
      plannedTimeZone: timeZone ?? null,
      title,
    }),
  }).then((response) =>
    parseResponse<UpdateGoogleCalendarEventResponse>(response),
  );

export const deleteGoogleCalendarEvent = ({
  eventId,
}: {
  eventId: string;
}): Promise<DeleteGoogleCalendarEventResponse> =>
  mobileApiFetch("/api/google-calendar/events", {
    method: "DELETE",
    body: JSON.stringify({ eventId }),
  }).then((response) =>
    parseResponse<DeleteGoogleCalendarEventResponse>(response),
  );

export function getLocalTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
