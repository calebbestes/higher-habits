import "server-only";

import { createAuth } from "@habit/auth";
import { accounts, getDb } from "@habit/db";
import { and, eq } from "drizzle-orm";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_CALENDAR_LIST_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

const GOOGLE_CALENDAR_WRITE_SCOPES = new Set([
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.owned",
]);

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

type GoogleCalendarColorDefinition = {
  background?: string;
  foreground?: string;
};

type GoogleCalendarColorsResponse = {
  calendar?: Record<string, GoogleCalendarColorDefinition>;
  event?: Record<string, GoogleCalendarColorDefinition>;
};

type GoogleCalendarListEntryResponse = {
  backgroundColor?: string;
  colorId?: string;
  foregroundColor?: string;
};

type GoogleCalendarApiEvent = {
  colorId?: string;
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

export type GoogleCalendarEvent = {
  backgroundColor?: string | null;
  colorId?: string | null;
  foregroundColor?: string | null;
  id: string;
  title: string;
  description: string | null;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  allDay: boolean;
};

const GOOGLE_CALENDAR_COLORS_CACHE_MS = 60 * 60 * 1000;
let googleCalendarColorsCache: {
  calendar: Record<string, GoogleCalendarColorDefinition>;
  event: Record<string, GoogleCalendarColorDefinition>;
  expiresAt: number;
} | null = null;

type GoogleCalendarEventBody = {
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
  summary: string;
  description?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
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
  return scopes.some((scope) => GOOGLE_CALENDAR_WRITE_SCOPES.has(scope));
}

export async function getGoogleCalendarConnectionStatus(userId: string) {
  const db = getDb();
  const configured = isGoogleAuthConfigured();

  if (!db) {
    return {
      configured,
      connected: false,
      hasGoogleAccount: false,
      hasCalendarListReadScope: false,
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
    hasCalendarListReadScope: scopes.includes(GOOGLE_CALENDAR_LIST_READ_SCOPE),
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
}> {
  return upsertGoogleCalendarPlannedEvent({
    dateKey,
    description,
    existingEventId,
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
  dateKey,
  description,
  existingEventId,
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
  dateKey: string;
  description?: string | null;
  existingEventId?: string | null;
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
  eventId?: string | null;
}> {
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const updateBody = buildGoogleCalendarEvent({
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
        `/calendars/primary/events/${encodeURIComponent(existingEventId)}`,
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
          eventId: updated?.id ?? existingEventId,
        };
      }

      if (updateResponse.status !== 404 && updateResponse.status !== 410) {
        await throwGoogleCalendarError(updateResponse);
      }
    }

    const insertBody = buildGoogleCalendarEvent({
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
      "/calendars/primary/events",
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

    return { status: "synced", eventId: inserted?.id ?? null };
  } catch (error) {
    console.error("Google Calendar plan sync failed", error);
    return { status: "error" };
  }
}

export async function deleteGoogleCalendarHabitPlan({
  eventId,
  userId,
}: {
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
  return deleteGoogleCalendarPlannedEvent({ eventId, userId });
}

export async function deleteGoogleCalendarPlannedEvent({
  eventId,
  userId,
}: {
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
      `/calendars/primary/events/${encodeURIComponent(eventId)}`,
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
  userId,
}: {
  description?: string | null;
  eventId?: string | null;
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
      `/calendars/primary/events/${encodeURIComponent(eventId)}`,
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
  timeMax,
  timeMin,
  timeZone,
  userId,
}: {
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

    const params = new URLSearchParams({
      orderBy: "startTime",
      singleEvents: "true",
      timeMax,
      timeMin,
    });
    if (timeZone) params.set("timeZone", timeZone);

    const [response, colors, primaryCalendar] = await Promise.all([
      googleCalendarFetch(
        `/calendars/primary/events?${params.toString()}`,
        token.accessToken,
        { method: "GET" },
      ),
      getGoogleCalendarColors(token.accessToken),
      getGoogleCalendarPrimaryCalendar(token.accessToken),
    ]);
    await throwIfGoogleCalendarError(response);

    const primaryCalendarColor = resolveGoogleCalendarPrimaryColor(
      primaryCalendar,
      colors?.calendar,
    );

    const body = (await response
      .json()
      .catch(() => null)) as GoogleCalendarEventsListResponse | null;
    const events = (body?.items ?? [])
      .filter((event) => event.status !== "cancelled")
      .filter((event) => !isHigherHabitsCalendarEvent(event))
      .map((event) =>
        normalizeGoogleCalendarEvent(
          event,
          colors?.event,
          primaryCalendarColor,
        ),
      )
      .filter((event): event is GoogleCalendarEvent => Boolean(event));

    return { status: "synced", events };
  } catch (error) {
    console.error("Google Calendar event list failed", error);
    return { status: "error", events: [] };
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

    const trimmedDescription = description?.trim();
    const body: GoogleCalendarDirectEventBody = {
      summary: title,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...buildGoogleCalendarEventTime({
        dateKey,
        plannedEndTime,
        plannedStartTime,
        timeZone,
      }),
    };
    const response = await googleCalendarFetch(
      "/calendars/primary/events",
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
      event: inserted ? normalizeGoogleCalendarEvent(inserted) : null,
    };
  } catch (error) {
    console.error("Google Calendar event create failed", error);
    return { status: "error" };
  }
}

export async function updateGoogleCalendarPrimaryEvent({
  dateKey,
  description,
  eventId,
  plannedEndTime,
  plannedStartTime,
  timeZone,
  title,
  userId,
}: {
  dateKey: string;
  description?: string | null;
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
    const body: GoogleCalendarDirectEventBody = {
      summary: title,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...buildGoogleCalendarEventTime({
        dateKey,
        plannedEndTime,
        plannedStartTime,
        timeZone,
      }),
    };
    const response = await googleCalendarFetch(
      `/calendars/primary/events/${encodeURIComponent(eventId)}`,
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
      event: updated ? normalizeGoogleCalendarEvent(updated) : null,
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
    ? `${trimmedDescription}\n\nPlanned from Higher Habits.`
    : "Planned from Higher Habits.";
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

async function getGoogleCalendarPrimaryCalendar(
  accessToken: string,
): Promise<GoogleCalendarListEntryResponse | null> {
  try {
    const response = await googleCalendarFetch(
      "/users/me/calendarList/primary",
      accessToken,
      { method: "GET" },
    );
    if (!response.ok) return null;

    return (await response
      .json()
      .catch(() => null)) as GoogleCalendarListEntryResponse | null;
  } catch {
    return null;
  }
}

function resolveGoogleCalendarPrimaryColor(
  calendar: GoogleCalendarListEntryResponse | null,
  calendarColors?: Record<string, GoogleCalendarColorDefinition>,
): GoogleCalendarColorDefinition | null {
  if (!calendar) return null;

  const indexedColor = calendar.colorId
    ? calendarColors?.[calendar.colorId]
    : undefined;
  const background = calendar.backgroundColor ?? indexedColor?.background;
  const foreground = calendar.foregroundColor ?? indexedColor?.foreground;

  return background || foreground ? { background, foreground } : null;
}

function normalizeGoogleCalendarEvent(
  event: GoogleCalendarApiEvent,
  eventColors?: Record<string, GoogleCalendarColorDefinition> | null,
  primaryCalendarColor?: GoogleCalendarColorDefinition | null,
): GoogleCalendarEvent | null {
  const id = event.id;
  const start = event.start;
  const end = event.end;

  if (!id || !start || !end) return null;

  const color = event.colorId
    ? (eventColors?.[event.colorId] ?? primaryCalendarColor)
    : primaryCalendarColor;

  return {
    backgroundColor: color?.background ?? null,
    colorId: event.colorId ?? null,
    foregroundColor: color?.foreground ?? null,
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
