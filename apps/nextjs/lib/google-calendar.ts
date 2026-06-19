import "server-only";

import { createAuth } from "@habit/auth";
import { accounts, getDb } from "@habit/db";
import { and, eq } from "drizzle-orm";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

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

type GoogleCalendarEventBody = {
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  extendedProperties: {
    private: Record<string, string>;
  };
};

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
      scopes: [] as string[],
    };
  }

  const [account] = await db
    .select({ scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);
  const scopes = parseOAuthScopes(account?.scope);

  return {
    configured,
    connected: configured && hasGoogleCalendarWriteScope(scopes),
    hasGoogleAccount: Boolean(account),
    scopes,
  };
}

export async function upsertGoogleCalendarHabitPlan({
  dateKey,
  description,
  existingEventId,
  goalId,
  habitName,
  plannedEndTime,
  plannedStartTime,
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
  try {
    const token = await getGoogleCalendarAccessToken(userId);
    if (token.status !== "connected") {
      return { status: token.status };
    }

    const body = buildGoogleCalendarEvent({
      dateKey,
      description,
      goalId,
      habitName,
      plannedEndTime,
      plannedStartTime,
      timeZone,
    });

    if (existingEventId) {
      const updateResponse = await googleCalendarFetch(
        `/calendars/primary/events/${encodeURIComponent(existingEventId)}`,
        token.accessToken,
        {
          body: JSON.stringify(body),
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

    const insertResponse = await googleCalendarFetch(
      "/calendars/primary/events",
      token.accessToken,
      {
        body: JSON.stringify(body),
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
    // better-auth's getAccessToken returns the granted scopes as a single
    // comma/space-separated `scope` string, not a `scopes` array.
    const token = (await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    })) as {
      accessToken?: string;
      scope?: string;
    };
    const scopes = parseOAuthScopes(token.scope);

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

function buildGoogleCalendarEvent({
  dateKey,
  description,
  goalId,
  habitName,
  plannedEndTime,
  plannedStartTime,
  timeZone,
}: {
  dateKey: string;
  description?: string | null;
  goalId: string;
  habitName: string;
  plannedEndTime?: string | null;
  plannedStartTime?: string | null;
  timeZone?: string | null;
}): GoogleCalendarEventBody {
  return {
    summary: habitName,
    description: buildGoogleCalendarEventDescription(description),
    ...buildGoogleCalendarEventTime({
      dateKey,
      plannedEndTime,
      plannedStartTime,
      timeZone,
    }),
    extendedProperties: {
      private: {
        higherHabitsGoalId: goalId,
        higherHabitsDate: dateKey,
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
    const endDateKey =
      timeToMinutes(plannedEndTime) <= timeToMinutes(plannedStartTime)
        ? addDaysToDateKey(dateKey, 1)
        : dateKey;

    return {
      start: {
        dateTime: `${dateKey}T${plannedStartTime}:00`,
        timeZone: timeZone || "UTC",
      },
      end: {
        dateTime: `${endDateKey}T${plannedEndTime}:00`,
        timeZone: timeZone || "UTC",
      },
    };
  }

  return {
    start: { date: dateKey },
    end: { date: addDaysToDateKey(dateKey, 1) },
  };
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
