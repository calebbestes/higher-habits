import { mobileApiFetch } from "@/lib/mobile-api";

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  hasCalendarMetadataReadScope: boolean;
  hasFloatCalendarColorScope: boolean;
  hasFloatCalendarCreationScope: boolean;
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
  calendarBackgroundColor?: string | null;
  calendarForegroundColor?: string | null;
  calendarId: string;
  calendarName: string;
  higherHabitsSourceId?: string | null;
  higherHabitsSourceType?: string | null;
};

export type GoogleCalendar = {
  backgroundColor: string | null;
  description: string | null;
  foregroundColor: string | null;
  id: string;
  primary: boolean;
  summary: string;
};

export type GoogleCalendarEventColor = {
  backgroundColor: string;
  colorId: string;
  foregroundColor: string;
  label?: string;
};

export type GoogleCalendarColorsResponse = {
  calendarColors?: GoogleCalendarEventColor[];
  colors?: GoogleCalendarEventColor[];
  error?: string;
  eventLabels?: GoogleCalendarEventColor[];
  status: GoogleCalendarEventsResponse["status"];
};

export type GoogleCalendarsResponse = {
  status: GoogleCalendarEventsResponse["status"];
  calendars: GoogleCalendar[];
  error?: string;
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
  calendarId?: string;
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

export const ensureFloatGoogleCalendar = (): Promise<{
  status: GoogleCalendarEventsResponse["status"];
  calendar?: GoogleCalendar;
  error?: string;
}> =>
  mobileApiFetch("/api/google-calendar/float-calendar", {
    method: "POST",
  })
    .then((response) =>
      parseResponse<{
        status: GoogleCalendarEventsResponse["status"];
        calendar?: GoogleCalendar;
        error?: string;
      }>(response),
    )
    .then((result) => {
      if (result.status !== "synced") {
        console.error(
          "[Google Calendar] Float calendar setup failed:",
          result.error ?? result.status,
        );
      }
      return result;
    });

export const fetchGoogleCalendarEvents = ({
  calendarIds,
  timeMax,
  timeMin,
  timeZone,
}: {
  calendarIds?: string[];
  timeMax: string;
  timeMin: string;
  timeZone?: string | null;
}): Promise<GoogleCalendarEventsResponse> => {
  const params = new URLSearchParams({ timeMax, timeMin });
  if (calendarIds?.length === 0) params.append("calendarId", "__none__");
  for (const calendarId of calendarIds ?? []) {
    params.append("calendarId", calendarId);
  }
  if (timeZone) params.set("timeZone", timeZone);

  return mobileApiFetch(
    `/api/google-calendar/events?${params.toString()}`,
  ).then((response) => parseResponse<GoogleCalendarEventsResponse>(response));
};

export const fetchGoogleCalendars = (): Promise<GoogleCalendarsResponse> =>
  mobileApiFetch("/api/google-calendar/calendars")
    .then((response) => parseResponse<GoogleCalendarsResponse>(response))
    .then((result) => {
      if (result.status !== "synced") {
        const message =
          result.error ?? `Google Calendar list failed (${result.status}).`;
        console.error("[Google Calendar] Calendar list failed:", message);
        throw new Error(message);
      }
      return result;
    });

let cachedGoogleCalendarColors: GoogleCalendarColorsResponse | null = null;
let googleCalendarColorsRequest: Promise<GoogleCalendarColorsResponse> | null =
  null;

export const fetchGoogleCalendarColors =
  async (): Promise<GoogleCalendarColorsResponse> => {
    if (cachedGoogleCalendarColors) return cachedGoogleCalendarColors;
    if (googleCalendarColorsRequest) return googleCalendarColorsRequest;

    googleCalendarColorsRequest = mobileApiFetch("/api/google-calendar/colors")
      .then((response) => parseResponse<GoogleCalendarColorsResponse>(response))
      .then((result) => {
        const colors = result.colors ?? [];
        const calendarColors = result.calendarColors ?? [];
        const eventLabels = result.eventLabels ?? [];
        if (result.status !== "synced") {
          console.error(
            "[Google Calendar] Colors failed:",
            result.error ?? result.status,
          );
        }
        if (
          result.status === "synced" &&
          (colors.length > 0 ||
            calendarColors.length > 0 ||
            eventLabels.length > 0)
        ) {
          cachedGoogleCalendarColors = {
            ...result,
            calendarColors,
            colors,
            eventLabels,
          };
        }
        return { ...result, calendarColors, colors, eventLabels };
      })
      .catch((error) => {
        console.error("[Google Calendar] Colors request failed:", error);
        return {
          calendarColors: [],
          colors: [],
          eventLabels: [],
          status: "error" as const,
        };
      })
      .finally(() => {
        googleCalendarColorsRequest = null;
      });

    return googleCalendarColorsRequest;
  };

export const fetchGoogleCalendarEventColors = async () => {
  const result = await fetchGoogleCalendarColors();
  return result.eventLabels?.length
    ? result.eventLabels
    : (result.colors ?? []);
};

export const fetchGoogleCalendarCalendarColors = async () =>
  (await fetchGoogleCalendarColors()).calendarColors ?? [];

export const updateGoogleCalendarColor = ({
  backgroundColor,
  calendarId,
  foregroundColor,
}: {
  backgroundColor: string;
  calendarId: string;
  foregroundColor: string;
}): Promise<{
  status: GoogleCalendarEventsResponse["status"];
  calendar?: GoogleCalendar;
  error?: string;
}> =>
  mobileApiFetch("/api/google-calendar/calendars", {
    method: "PATCH",
    body: JSON.stringify({ backgroundColor, calendarId, foregroundColor }),
  }).then((response) =>
    parseResponse<{
      status: GoogleCalendarEventsResponse["status"];
      calendar?: GoogleCalendar;
      error?: string;
    }>(response),
  );

export const fetchGoogleCalendarSelection = (): Promise<{
  visibleGoogleCalendarIds: string[];
}> =>
  mobileApiFetch("/api/calendar-settings").then((response) =>
    parseResponse<{ visibleGoogleCalendarIds?: string[] }>(response).then(
      (settings) => ({
        visibleGoogleCalendarIds: settings.visibleGoogleCalendarIds ?? [
          "primary",
        ],
      }),
    ),
  );

export const saveGoogleCalendarSelection = (
  visibleGoogleCalendarIds: string[],
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/calendar-settings", {
    method: "POST",
    body: JSON.stringify({
      visibleGoogleCalendarIds,
    }),
  }).then((response) => parseResponse<{ ok: true }>(response));

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
  calendarId,
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
      ...(calendarId === undefined ? {} : { calendarId }),
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
  calendarId,
  eventId,
}: {
  calendarId?: string;
  eventId: string;
}): Promise<DeleteGoogleCalendarEventResponse> =>
  mobileApiFetch("/api/google-calendar/events", {
    method: "DELETE",
    body: JSON.stringify({
      eventId,
      ...(calendarId === undefined ? {} : { calendarId }),
    }),
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
