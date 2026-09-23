import "server-only";

import { createAuth } from "@habit/auth";
import { accounts, calendarSettings, getDb } from "@habit/db";
import { and, eq } from "drizzle-orm";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_METADATA_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendars.readonly";
export const GOOGLE_CALENDAR_LIST_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_CALENDAR_APP_CREATED_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const FLOAT_GOOGLE_CALENDAR_NAME = "Float";

type GoogleTokenResult =
  | { status: "connected"; accessToken: string; scopes: string[] }
  | {
      status:
        | "auth_unavailable"
        | "not_configured"
        | "not_connected"
        | "missing_scope";
      scopes?: string[];
    };

type GoogleCalendarEventResponse = {
  id?: string;
};

type GoogleCalendarEventsListResponse = {
  items?: GoogleCalendarApiEvent[];
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListItem[];
};

type GoogleCalendarColorDefinition = {
  background?: string;
  foreground?: string;
};

type GoogleCalendarColorsResponse = {
  calendar?: Record<string, GoogleCalendarColorDefinition>;
  event?: Record<string, GoogleCalendarColorDefinition>;
};

type GoogleCalendarEventLabel = {
  backgroundColor?: string;
  id?: string;
};

type GoogleCalendarResourceResponse = {
  labelProperties?: {
    eventLabels?: GoogleCalendarEventLabel[];
  };
};

type GoogleCalendarApiEvent = {
  backgroundColor?: string;
  colorId?: string;
  eventLabelId?: string;
  foregroundColor?: string;
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: {
    private?: Record<string, string | undefined>;
  };
};

type GoogleCalendarListItem = {
  backgroundColor?: string;
  description?: string;
  foregroundColor?: string;
  id?: string;
  primary?: boolean;
  summary?: string;
  summaryOverride?: string;
};

type GoogleCalendarListItemWithId = GoogleCalendarListItem & { id: string };

export type GoogleCalendarEvent = {
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
};

export type GoogleCalendar = {
  backgroundColor: string | null;
  description: string | null;
  foregroundColor: string | null;
  id: string;
  primary: boolean;
  summary: string;
};

const GOOGLE_CALENDAR_COLORS_CACHE_MS = 60 * 60 * 1000;
const GOOGLE_MODERN_EVENT_COLOR_IDS: Record<string, string> = {
  "#7986cb": "1",
  "#33b679": "2",
  "#8e24aa": "3",
  "#e67c73": "4",
  "#f6bf26": "5",
  "#f4511e": "6",
  "#039be5": "7",
  "#616161": "8",
  "#3f51b5": "9",
  "#0b8043": "10",
  "#d50000": "11",
};
let googleCalendarColorsCache: {
  calendar: Record<string, GoogleCalendarColorDefinition>;
  event: Record<string, GoogleCalendarColorDefinition>;
  expiresAt: number;
} | null = null;

type GoogleCalendarEventBody = {
  colorId?: string;
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  recurrence?: string[];
  extendedProperties: {
    private: Record<string, string>;
  };
};

type GoogleCalendarDirectEventBody = {
  colorId?: string;
  eventLabelId?: string;
  summary: string;
  description?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  extendedProperties?: {
    private: Record<string, string>;
  };
};

type HigherHabitsPlannedEventSource =
  | "goal_checkpoint"
  | "habit"
  | "habit_instance"
  | "other_event"
  | "task";

export function isGoogleAuthConfigured() {
  return Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID) &&
      (process.env.GOOGLE_CLIENT_SECRET ||
        process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  );
}

export function parseOAuthScopes(scope: string | null | undefined): string[] {
  return scope?.split(/[,\s]+/).filter(Boolean) ?? [];
}

export function hasGoogleCalendarWriteScope(scopes: string[]) {
  return scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE);
}

export async function getGoogleCalendarConnectionStatus(userId: string) {
  const db = getDb();
  const configured = isGoogleAuthConfigured();

  if (!db) {
    return {
      configured,
      connected: false,
      hasGoogleAccount: false,
      hasCalendarMetadataReadScope: false,
      hasFloatCalendarCreationScope: false,
      scopes: [] as string[],
    };
  }

  const [account] = await db
    .select({ refreshToken: accounts.refreshToken, scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);
  const scopes = parseOAuthScopes(account?.scope);

  return {
    configured,
    connected:
      configured &&
      Boolean(account?.refreshToken) &&
      hasGoogleCalendarWriteScope(scopes),
    hasCalendarMetadataReadScope: scopes.includes(
      GOOGLE_CALENDAR_LIST_READ_SCOPE,
    ),
    hasFloatCalendarCreationScope: scopes.includes(
      GOOGLE_CALENDAR_APP_CREATED_SCOPE,
    ),
    hasGoogleAccount: Boolean(account),
    scopes,
  };
}

export async function disconnectGoogleCalendar(userId: string) {
  const db = getDb();

  if (!db) {
    throw new Error("Database unavailable.");
  }

  const [account] = await db
    .select({
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);

  if (!account) {
    return { disconnected: false };
  }

  const tokens = [account.refreshToken, account.accessToken].filter(
    (token): token is string => Boolean(token),
  );

  await Promise.allSettled(tokens.map(revokeGoogleToken));

  await db
    .update(accounts)
    .set({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
      scope: null,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")));

  return { disconnected: true };
}

async function revokeGoogleToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      body: new URLSearchParams({ token }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  } catch {
    // Clearing the local credentials still disconnects Calendar in the app if
    // Google has already expired or rejected the token.
  }
}

export async function upsertGoogleCalendarHabitPlan({
  dateKey,
  description,
  existingEventId,
  googleCalendarId,
  goalId,
  habitName,
  plannedEndTime,
  plannedStartTime,
  repeatDaily,
  timeZone,
  userId,
}: {
  dateKey: string;
  description?: string | null;
  existingEventId?: string | null;
  googleCalendarId?: string | null;
  goalId: string;
  habitName: string;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  repeatDaily?: boolean;
  timeZone?: string | null;
  userId: string;
}): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  eventId?: string | null;
  calendarId?: string | null;
}> {
  return upsertGoogleCalendarPlannedEvent({
    dateKey,
    description,
    existingEventId,
    googleCalendarId,
    plannedEndTime,
    plannedStartTime,
    repeatDaily,
    sourceId: goalId,
    sourceType: "habit",
    title: habitName,
    timeZone,
    userId,
    extraPrivateProperties: {
      higherHabitsGoalId: goalId,
    },
  });
}

export async function upsertGoogleCalendarPlannedEvent({
  color,
  dateKey,
  description,
  existingEventId,
  googleCalendarId,
  plannedEndTime,
  plannedStartTime,
  repeatDaily,
  sourceId,
  sourceType,
  title,
  timeZone,
  userId,
  extraPrivateProperties,
}: {
  color?: string | null;
  dateKey: string;
  description?: string | null;
  existingEventId?: string | null;
  googleCalendarId?: string | null;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  repeatDaily?: boolean;
  sourceId: string;
  sourceType: HigherHabitsPlannedEventSource;
  title: string;
  timeZone?: string | null;
  userId: string;
  extraPrivateProperties?: Record<string, string>;
}): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  calendarId?: string | null;
  eventId?: string | null;
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    let calendarId = existingEventId ? (googleCalendarId ?? "primary") : null;
    if (!existingEventId) {
      const floatCalendar = await ensureFloatGoogleCalendarWithToken(
        userId,
        token,
      );
      if (floatCalendar.status !== "synced" || !floatCalendar.calendar) {
        return { status: floatCalendar.status };
      }
      calendarId = floatCalendar.calendar.id;
    }

    const colorId =
      color === undefined
        ? undefined
        : color === null
          ? ""
          : await resolveGoogleCalendarEventColorId(token.accessToken, color);
    if (color !== undefined && color !== null && !colorId) {
      throw new Error("That color is not available in Google Calendar.");
    }

    const updateBody = buildGoogleCalendarEvent({
      colorId,
      dateKey,
      description,
      plannedEndTime,
      plannedStartTime,
      recurrence:
        repeatDaily === undefined
          ? undefined
          : repeatDaily
            ? ["RRULE:FREQ=DAILY"]
            : [],
      sourceId,
      sourceType,
      title,
      timeZone,
      extraPrivateProperties,
    });

    if (existingEventId) {
      const updateResponse = await googleCalendarFetch(
        `/calendars/${encodeURIComponent(calendarId ?? "primary")}/events/${encodeURIComponent(existingEventId)}`,
        token.accessToken,
        {
          body: JSON.stringify(updateBody),
          method: "PATCH",
        },
      );

      if (updateResponse.ok) {
        const updated = (await updateResponse
          .json()
          .catch(() => null)) as GoogleCalendarEventResponse | null;
        return {
          status: "synced",
          calendarId,
          eventId: updated?.id ?? existingEventId,
        };
      }

      if (updateResponse.status !== 404 && updateResponse.status !== 410) {
        await throwGoogleCalendarError(updateResponse);
      }
    }

    const insertBody = buildGoogleCalendarEvent({
      colorId,
      dateKey,
      description,
      plannedEndTime,
      plannedStartTime,
      recurrence: repeatDaily ? ["RRULE:FREQ=DAILY"] : undefined,
      sourceId,
      sourceType,
      title,
      timeZone,
      extraPrivateProperties,
    });
    const insertResponse = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calendarId ?? "primary")}/events`,
      token.accessToken,
      {
        body: JSON.stringify(insertBody),
        method: "POST",
      },
    );
    await throwIfGoogleCalendarError(insertResponse);
    const inserted = (await insertResponse
      .json()
      .catch(() => null)) as GoogleCalendarEventResponse | null;

    return {
      status: "synced",
      calendarId,
      eventId: inserted?.id ?? null,
    };
  } catch (error) {
    console.error("Google Calendar plan sync failed", error);
    return { status: "error" };
  }
}

export async function deleteGoogleCalendarHabitPlan({
  eventId,
  calendarId,
  userId,
}: {
  eventId?: string | null;
  calendarId?: string | null;
  userId: string;
}): Promise<{
  status:
    | "deleted"
    | "skipped"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
}> {
  return deleteGoogleCalendarPlannedEvent({
    calendarId: calendarId ?? undefined,
    eventId,
    userId,
  });
}

export async function deleteGoogleCalendarPrimaryEvent({
  calendarId = "primary",
  eventId,
  userId,
}: {
  calendarId?: string;
  eventId: string;
  userId: string;
}): Promise<{
  status:
    | "deleted"
    | "skipped"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
}> {
  return deleteGoogleCalendarPlannedEvent({ calendarId, eventId, userId });
}

export async function deleteGoogleCalendarPlannedEvent({
  calendarId = "primary",
  eventId,
  userId,
}: {
  calendarId?: string;
  eventId?: string | null;
  userId: string;
}): Promise<{
  status:
    | "deleted"
    | "skipped"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
}> {
  if (!eventId) return { status: "skipped" };

  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const response = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      token.accessToken,
      { method: "DELETE" },
    );

    if (response.status === 404 || response.status === 410) {
      return { status: "deleted" };
    }

    await throwIfGoogleCalendarError(response);
    return { status: "deleted" };
  } catch (error) {
    console.error("Google Calendar plan delete failed", error);
    return { status: "error" };
  }
}

export async function updateGoogleCalendarHabitPlanDescription({
  description,
  eventId,
  calendarId = "primary",
  userId,
}: {
  description?: string | null;
  eventId?: string | null;
  calendarId?: string;
  userId: string;
}): Promise<{
  status:
    | "synced"
    | "skipped"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
}> {
  if (!eventId) return { status: "skipped" };

  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const response = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      token.accessToken,
      {
        body: JSON.stringify({
          description: buildGoogleCalendarEventDescription(description),
        }),
        method: "PATCH",
      },
    );

    if (response.status === 404 || response.status === 410) {
      return { status: "skipped" };
    }

    await throwIfGoogleCalendarError(response);
    return { status: "synced" };
  } catch (error) {
    console.error("Google Calendar description sync failed", error);
    return { status: "error" };
  }
}

export async function listGoogleCalendarPrimaryEventsForRange({
  calendarIds,
  timeMax,
  timeMin,
  timeZone,
  userId,
}: {
  calendarIds?: string[];
  timeMax: string;
  timeMin: string;
  timeZone?: string | null;
  userId: string;
}): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  events: GoogleCalendarEvent[];
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status, events: [] };
    }

    const selectedCalendarIds = [
      ...new Set(calendarIds === undefined ? ["primary"] : calendarIds),
    ];
    const [colors, eventLabels, calendarList] = await Promise.all([
      getGoogleCalendarColors(token.accessToken),
      getGoogleCalendarEventLabels(token.accessToken),
      fetchGoogleCalendarList(token.accessToken),
    ]);
    const calendarsById = new Map(
      calendarList.map((calendar) => [calendar.id, calendar]),
    );
    const calendarResults = await Promise.all(
      selectedCalendarIds.map(async (calendarId) => {
        const params = new URLSearchParams({
          orderBy: "startTime",
          singleEvents: "true",
          timeMax,
          timeMin,
        });
        if (timeZone) params.set("timeZone", timeZone);

        const response = await googleCalendarFetch(
          `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
          token.accessToken,
          { method: "GET" },
        );
        await throwIfGoogleCalendarError(response);
        const body = (await response
          .json()
          .catch(() => null)) as GoogleCalendarEventsListResponse | null;
        return (body?.items ?? [])
          .filter((event) => event.status !== "cancelled")
          .filter((event) => !isHigherHabitsCalendarEvent(event))
          .map((event) =>
            normalizeGoogleCalendarEvent(
              event,
              colors?.event,
              eventLabels,
              calendarId,
              calendarsById.get(calendarId),
            ),
          )
          .filter((event): event is GoogleCalendarEvent => Boolean(event));
      }),
    );
    const events = calendarResults.flat();

    return { status: "synced", events };
  } catch (error) {
    console.error("Google Calendar event list failed", error);
    return { status: "error", events: [] };
  }
}

export async function listGoogleCalendars(userId: string): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  calendars: GoogleCalendar[];
  error?: string;
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status, calendars: [] };
    }

    const calendars = (await fetchGoogleCalendarList(token.accessToken)).map(
      (calendar) => ({
        backgroundColor: calendar.backgroundColor ?? null,
        description: calendar.description ?? null,
        foregroundColor: calendar.foregroundColor ?? null,
        id: calendar.id,
        primary: Boolean(calendar.primary),
        summary:
          calendar.summaryOverride?.trim() ||
          calendar.summary?.trim() ||
          "Untitled calendar",
      }),
    );

    return { status: "synced", calendars };
  } catch (error) {
    console.error("Google Calendar list failed", error);
    return {
      status: "error",
      calendars: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchGoogleCalendarList(
  accessToken: string,
): Promise<GoogleCalendarListItemWithId[]> {
  const response = await googleCalendarFetch(
    "/users/me/calendarList?maxResults=250&showHidden=false",
    accessToken,
    { method: "GET" },
  );
  await throwIfGoogleCalendarError(response);
  const body = (await response
    .json()
    .catch(() => null)) as GoogleCalendarListResponse | null;

  return (body?.items ?? []).filter(
    (calendar): calendar is GoogleCalendarListItemWithId =>
      Boolean(calendar.id),
  );
}

type FloatCalendarSyncResult = {
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  calendar?: GoogleCalendar;
  error?: string;
};

export async function ensureFloatGoogleCalendar(
  userId: string,
): Promise<FloatCalendarSyncResult> {
  try {
    // Reconnecting can grant new scopes while the previously cached access
    // token is still technically valid. Force a refresh so Google issues a
    // token that includes calendar.app.created before we call the Calendar API.
    const token = await refreshGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") return { status: token.status };
    return ensureFloatGoogleCalendarWithToken(userId, token);
  } catch (error) {
    console.error("Float Google Calendar ensure failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensureFloatGoogleCalendarWithToken(
  userId: string,
  token: Extract<GoogleTokenResult, { status: "connected" }>,
): Promise<FloatCalendarSyncResult> {
  const db = getDb();
  const [settings] = db
    ? await db
        .select({
          floatGoogleCalendarId: calendarSettings.floatGoogleCalendarId,
        })
        .from(calendarSettings)
        .where(eq(calendarSettings.userId, userId))
        .limit(1)
    : [];
  const calendars = await fetchGoogleCalendarList(token.accessToken);
  const floatCalendar =
    calendars.find(
      (calendar) => calendar.id === settings?.floatGoogleCalendarId,
    ) ??
    calendars.find(
      (calendar) =>
        !calendar.primary &&
        calendar.summary?.trim() === FLOAT_GOOGLE_CALENDAR_NAME,
    );

  let calendar = floatCalendar;
  if (!calendar) {
    if (!token.scopes.includes(GOOGLE_CALENDAR_APP_CREATED_SCOPE)) {
      return { status: "missing_scope" };
    }

    const response = await googleCalendarFetch(
      "/calendars",
      token.accessToken,
      {
        body: JSON.stringify({
          description: "Calendar for events planned in Float.",
          summary: FLOAT_GOOGLE_CALENDAR_NAME,
        }),
        method: "POST",
      },
    );
    await throwIfGoogleCalendarError(response);
    calendar = (await response.json()) as GoogleCalendarListItemWithId;
  }

  const normalizedCalendar: GoogleCalendar = {
    backgroundColor: calendar.backgroundColor ?? null,
    description: calendar.description ?? null,
    foregroundColor: calendar.foregroundColor ?? null,
    id: calendar.id,
    primary: Boolean(calendar.primary),
    summary:
      calendar.summaryOverride?.trim() ||
      calendar.summary?.trim() ||
      FLOAT_GOOGLE_CALENDAR_NAME,
  };

  if (db) {
    try {
      await db
        .insert(calendarSettings)
        .values({
          floatGoogleCalendarId: normalizedCalendar.id,
          userId,
        })
        .onConflictDoUpdate({
          target: calendarSettings.userId,
          set: {
            floatGoogleCalendarId: normalizedCalendar.id,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      // Google has already created or confirmed the calendar. A settings
      // persistence failure should not make the user retry calendar creation.
      console.error("Could not save the Float Google Calendar ID", error);
    }
  }

  return { status: "synced", calendar: normalizedCalendar };
}

async function refreshGoogleCalendarAccessToken(
  userId: string,
): Promise<GoogleTokenResult> {
  if (!isGoogleAuthConfigured()) {
    return { status: "not_configured" };
  }

  const auth = createAuth();
  if (!auth) {
    return { status: "auth_unavailable" };
  }

  try {
    const token = (await auth.api.refreshToken({
      body: { providerId: "google", userId },
    })) as {
      accessToken?: string;
      scope?: string;
      scopes?: string[];
    };
    const scopes = parseGoogleTokenScopes(token);

    if (!token.accessToken) {
      return { status: "not_connected", scopes };
    }

    if (!hasGoogleCalendarWriteScope(scopes)) {
      return { status: "missing_scope", scopes };
    }

    return {
      status: "connected",
      accessToken: token.accessToken,
      scopes,
    };
  } catch {
    return { status: "not_connected" };
  }
}

export async function createGoogleCalendarPrimaryEvent({
  dateKey,
  description,
  plannedEndTime,
  plannedStartTime,
  timeZone,
  title,
  userId,
}: {
  dateKey: string;
  description?: string | null;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  timeZone?: string | null;
  title: string;
  userId: string;
}): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  event?: GoogleCalendarEvent | null;
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const floatCalendar = await ensureFloatGoogleCalendarWithToken(
      userId,
      token,
    );
    if (floatCalendar.status !== "synced" || !floatCalendar.calendar) {
      return { status: floatCalendar.status };
    }
    const calendarId = floatCalendar.calendar.id;

    const trimmedDescription = description?.trim();
    const body: GoogleCalendarDirectEventBody = {
      summary: title,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      extendedProperties: {
        private: {
          higherHabitsSourceType: "other_event",
          higherHabitsDate: dateKey,
        },
      },
      ...buildGoogleCalendarEventTime({
        dateKey,
        plannedEndTime,
        plannedStartTime,
        timeZone,
      }),
    };
    const response = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      token.accessToken,
      {
        body: JSON.stringify(body),
        method: "POST",
      },
    );
    await throwIfGoogleCalendarError(response);

    const inserted = (await response
      .json()
      .catch(() => null)) as GoogleCalendarApiEvent | null;

    return {
      status: "synced",
      event: inserted
        ? normalizeGoogleCalendarEvent(inserted, null, null, calendarId)
        : null,
    };
  } catch (error) {
    console.error("Google Calendar event create failed", error);
    return { status: "error" };
  }
}

export async function updateGoogleCalendarPrimaryEvent({
  allDay,
  calendarId = "primary",
  color,
  dateKey,
  description,
  eventLabelId,
  eventId,
  plannedEndTime,
  plannedStartTime,
  timeZone,
  title,
  userId,
}: {
  allDay?: boolean;
  calendarId?: string;
  color?: string | null;
  dateKey: string;
  description?: string | null;
  eventLabelId?: string | null;
  eventId: string;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  timeZone?: string | null;
  title: string;
  userId: string;
}): Promise<{
  status:
    | "synced"
    | "auth_unavailable"
    | "not_configured"
    | "not_connected"
    | "missing_scope"
    | "error";
  event?: GoogleCalendarEvent | null;
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const trimmedDescription = description?.trim();
    const colorSelection =
      color === undefined
        ? undefined
        : color === null
          ? eventLabelId
            ? { eventLabelId: "" }
            : { colorId: "" }
          : await resolveGoogleCalendarEventColorSelection(
              token.accessToken,
              color,
            );
    if (color !== undefined && color !== null && !colorSelection) {
      throw new Error("That color is not available in Google Calendar.");
    }
    const usesEventLabels = colorSelection?.eventLabelId !== undefined;
    const body: GoogleCalendarDirectEventBody = {
      summary: title,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(colorSelection?.colorId === undefined
        ? {}
        : { colorId: colorSelection.colorId }),
      ...(colorSelection?.eventLabelId === undefined
        ? {}
        : { eventLabelId: colorSelection.eventLabelId }),
      ...(allDay
        ? buildGoogleCalendarEventTime({
            dateKey,
            plannedEndTime: null,
            plannedStartTime: null,
            timeZone,
          })
        : buildGoogleCalendarEventTime({
            dateKey,
            plannedEndTime,
            plannedStartTime,
            timeZone,
          })),
    };
    const response = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${
        usesEventLabels ? "?eventLabelVersion=1" : ""
      }`,
      token.accessToken,
      {
        body: JSON.stringify(body),
        method: "PATCH",
      },
    );
    await throwIfGoogleCalendarError(response);

    const updated = (await response
      .json()
      .catch(() => null)) as GoogleCalendarApiEvent | null;

    return {
      status: "synced",
      event: updated
        ? await normalizeGoogleCalendarEventWithColors(
            token.accessToken,
            updated,
            calendarId,
          )
        : null,
    };
  } catch (error) {
    console.error("Google Calendar event update failed", error);
    return { status: "error" };
  }
}

async function getGoogleCalendarAccessToken(
  userId: string,
): Promise<GoogleTokenResult> {
  if (!isGoogleAuthConfigured()) {
    return { status: "not_configured" };
  }

  const auth = createAuth();
  if (!auth) {
    return { status: "auth_unavailable" };
  }

  try {
    const token = (await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    })) as {
      accessToken?: string;
      scope?: string;
      scopes?: string[];
    };
    const scopes = parseGoogleTokenScopes(token);

    if (!token.accessToken) {
      return { status: "not_connected", scopes };
    }

    if (!hasGoogleCalendarWriteScope(scopes)) {
      return { status: "missing_scope", scopes };
    }

    return {
      status: "connected",
      accessToken: token.accessToken,
      scopes,
    };
  } catch {
    return { status: "not_connected" };
  }
}

function parseGoogleTokenScopes(token: {
  scope?: string;
  scopes?: string[];
}): string[] {
  if (token.scopes?.length) {
    return token.scopes.flatMap(parseOAuthScopes);
  }

  return parseOAuthScopes(token.scope);
}

function buildGoogleCalendarEvent({
  colorId,
  dateKey,
  description,
  extraPrivateProperties,
  plannedEndTime,
  plannedStartTime,
  recurrence,
  sourceId,
  sourceType,
  title,
  timeZone,
}: {
  colorId?: string | null;
  dateKey: string;
  description?: string | null;
  extraPrivateProperties?: Record<string, string>;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  recurrence?: string[];
  sourceId: string;
  sourceType: HigherHabitsPlannedEventSource;
  title: string;
  timeZone?: string | null;
}): GoogleCalendarEventBody {
  return {
    ...(colorId == null ? {} : { colorId }),
    summary: title,
    description: buildGoogleCalendarEventDescription(description),
    ...buildGoogleCalendarEventTime({
      dateKey,
      plannedEndTime,
      plannedStartTime,
      timeZone,
    }),
    ...(recurrence === undefined ? {} : { recurrence }),
    extendedProperties: {
      private: {
        higherHabitsSourceId: sourceId,
        higherHabitsSourceType: sourceType,
        higherHabitsDate: dateKey,
        ...extraPrivateProperties,
      },
    },
  };
}

function buildGoogleCalendarEventDescription(description?: string | null) {
  const trimmedDescription = description?.trim();

  return trimmedDescription
    ? `${trimmedDescription}\n\nPlanned from Float.`
    : "Planned from Float.";
}

function isHigherHabitsCalendarEvent(event: GoogleCalendarApiEvent) {
  const privateProperties = event.extendedProperties?.private;
  return Boolean(
    privateProperties?.higherHabitsSourceId ||
      privateProperties?.higherHabitsSourceType ||
      privateProperties?.higherHabitsGoalId ||
      privateProperties?.higherHabitsDate,
  );
}

async function getGoogleCalendarColors(accessToken: string): Promise<{
  calendar: Record<string, GoogleCalendarColorDefinition>;
  event: Record<string, GoogleCalendarColorDefinition>;
} | null> {
  const now = Date.now();
  const cache = googleCalendarColorsCache;
  if (cache && cache.expiresAt > now) {
    return { calendar: cache.calendar, event: cache.event };
  }

  try {
    const response = await googleCalendarFetch("/colors", accessToken, {
      method: "GET",
    });
    if (!response.ok) return null;

    const body = (await response
      .json()
      .catch(() => null)) as GoogleCalendarColorsResponse | null;
    if (!body) return null;

    const colors = {
      calendar: body.calendar ?? {},
      event: body.event ?? {},
    };
    googleCalendarColorsCache = {
      calendar: colors.calendar,
      event: colors.event,
      expiresAt: now + GOOGLE_CALENDAR_COLORS_CACHE_MS,
    };

    return colors;
  } catch {
    return null;
  }
}

async function resolveGoogleCalendarEventColorId(
  accessToken: string,
  backgroundColor: string,
): Promise<string | null> {
  const colors = await getGoogleCalendarColors(accessToken);
  if (!colors) return null;

  const targetColor = backgroundColor.trim().toLowerCase();
  const modernColorId = GOOGLE_MODERN_EVENT_COLOR_IDS[targetColor];
  if (modernColorId && colors.event[modernColorId]) return modernColorId;

  return (
    Object.entries(colors.event).find(
      ([, definition]) =>
        definition.background?.trim().toLowerCase() === targetColor,
    )?.[0] ?? null
  );
}

async function resolveGoogleCalendarEventColorSelection(
  accessToken: string,
  backgroundColor: string,
): Promise<{ colorId?: string; eventLabelId?: string } | null> {
  const targetColor = backgroundColor.trim().toLowerCase();
  const eventLabels = await getGoogleCalendarEventLabels(accessToken);
  const eventLabelId = Object.entries(eventLabels).find(
    ([, definition]) =>
      definition.background?.trim().toLowerCase() === targetColor,
  )?.[0];
  if (eventLabelId) return { eventLabelId };

  const colorId = await resolveGoogleCalendarEventColorId(
    accessToken,
    backgroundColor,
  );
  return colorId ? { colorId } : null;
}

async function normalizeGoogleCalendarEventWithColors(
  accessToken: string,
  event: GoogleCalendarApiEvent,
  calendarId = "primary",
): Promise<GoogleCalendarEvent | null> {
  const [colors, eventLabels] = await Promise.all([
    getGoogleCalendarColors(accessToken),
    getGoogleCalendarEventLabels(accessToken),
  ]);

  return normalizeGoogleCalendarEvent(
    event,
    colors?.event,
    eventLabels,
    calendarId,
  );
}

async function getGoogleCalendarEventLabels(
  accessToken: string,
): Promise<Record<string, GoogleCalendarColorDefinition>> {
  try {
    const response = await googleCalendarFetch(
      "/calendars/primary",
      accessToken,
      { method: "GET" },
    );
    if (!response.ok) return {};

    const body = (await response
      .json()
      .catch(() => null)) as GoogleCalendarResourceResponse | null;
    return Object.fromEntries(
      (body?.labelProperties?.eventLabels ?? [])
        .filter((label): label is GoogleCalendarEventLabel & { id: string } =>
          Boolean(label.id && label.backgroundColor),
        )
        .map((label) => [
          label.id,
          { background: label.backgroundColor, foreground: "#1D1D1D" },
        ]),
    );
  } catch {
    return {};
  }
}

function normalizeGoogleCalendarEvent(
  event: GoogleCalendarApiEvent,
  eventColors?: Record<string, GoogleCalendarColorDefinition> | null,
  eventLabels?: Record<string, GoogleCalendarColorDefinition> | null,
  calendarId = "primary",
  calendar?: GoogleCalendarListItem,
): GoogleCalendarEvent | null {
  const id = event.id;
  const start = event.start;
  const end = event.end;

  if (!id || !start || !end) return null;

  const directColor =
    (event.eventLabelId || event.colorId) &&
    (event.backgroundColor || event.foregroundColor)
      ? {
          background: event.backgroundColor,
          foreground: event.foregroundColor,
        }
      : null;
  const color = event.eventLabelId
    ? (directColor ?? eventLabels?.[event.eventLabelId] ?? null)
    : event.colorId
      ? (directColor ?? eventColors?.[event.colorId] ?? null)
      : null;

  return {
    backgroundColor: color?.background ?? calendar?.backgroundColor ?? null,
    calendarBackgroundColor: calendar?.backgroundColor ?? null,
    calendarForegroundColor: calendar?.foregroundColor ?? null,
    calendarId,
    calendarName:
      calendar?.summaryOverride?.trim() ||
      calendar?.summary?.trim() ||
      "Google Calendar",
    colorId: event.colorId ?? null,
    eventLabelId: event.eventLabelId ?? null,
    foregroundColor: color?.foreground ?? calendar?.foregroundColor ?? null,
    id,
    title: event.summary?.trim() || "Untitled event",
    description: event.description?.trim() || null,
    start,
    end,
    allDay: Boolean(start.date && end.date),
  };
}

function buildGoogleCalendarEventTime({
  dateKey,
  plannedEndTime,
  plannedStartTime,
  timeZone,
}: {
  dateKey: string;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  timeZone?: string | null;
}): Pick<GoogleCalendarEventBody, "start" | "end"> {
  if (plannedStartTime && plannedEndTime) {
    const normalizedStartTime = normalizeGoogleCalendarTime(plannedStartTime);
    const normalizedEndTime = normalizeGoogleCalendarTime(plannedEndTime);
    const endDateKey =
      timeToMinutes(normalizedEndTime) <= timeToMinutes(normalizedStartTime)
        ? addDaysToDateKey(dateKey, 1)
        : dateKey;

    return {
      start: {
        dateTime: `${dateKey}T${normalizedStartTime}:00`,
        timeZone: timeZone || "UTC",
      },
      end: {
        dateTime: `${endDateKey}T${normalizedEndTime}:00`,
        timeZone: timeZone || "UTC",
      },
    };
  }

  return {
    start: { date: dateKey },
    end: { date: addDaysToDateKey(dateKey, 1) },
  };
}

function normalizeGoogleCalendarTime(time: string) {
  const [hours = "0", minutes = "00"] = time.split(":");

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function googleCalendarFetch(
  path: string,
  accessToken: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers,
  });
}

async function throwIfGoogleCalendarError(response: Response) {
  if (!response.ok) {
    await throwGoogleCalendarError(response);
  }
}

async function throwGoogleCalendarError(response: Response): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new Error(
    `Google Calendar API ${response.status}: ${body || response.statusText}`,
  );
}
