import { mobileApiFetch } from "@/lib/mobile-api";

export type PlannedEventSourceType = "goal_checkpoint" | "task";

export type PlannedEvent = {
  id: string;
  sourceType: PlannedEventSourceType;
  sourceId: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  googleCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlannedEventInput = {
  sourceType: PlannedEventSourceType;
  sourceId: string;
  title?: string;
  dateKey: string;
  startTime?: string | null;
  endTime?: string | null;
  timeZone?: string | null;
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

export const fetchPlannedEvents = ({
  dateKey,
  sourceType,
}: {
  dateKey?: string | null;
  sourceType?: PlannedEventSourceType | null;
} = {}) => {
  const params = new URLSearchParams();
  if (dateKey) params.set("dateKey", dateKey);
  if (sourceType) params.set("sourceType", sourceType);
  const query = params.toString();

  return mobileApiFetch(`/api/planned-events${query ? `?${query}` : ""}`).then(
    (response) => parseResponse<PlannedEvent[]>(response),
  );
};

export const upsertPlannedEvent = ({
  dateKey,
  endTime,
  sourceId,
  sourceType,
  startTime,
  timeZone,
  title,
}: PlannedEventInput) =>
  mobileApiFetch("/api/planned-events", {
    method: "POST",
    body: JSON.stringify({
      type: "upsert",
      sourceType,
      sourceId,
      title,
      dateKey,
      plannedStartTime: startTime ?? null,
      plannedEndTime: endTime ?? null,
      plannedTimeZone: timeZone ?? null,
    }),
  }).then((response) =>
    parseResponse<{ event: PlannedEvent; calendarSync?: { status: string } }>(
      response,
    ),
  );

export const deletePlannedEvent = ({
  sourceId,
  sourceType,
}: {
  sourceId: string;
  sourceType: PlannedEventSourceType;
}) =>
  mobileApiFetch("/api/planned-events", {
    method: "POST",
    body: JSON.stringify({
      type: "delete",
      sourceType,
      sourceId,
    }),
  }).then((response) =>
    parseResponse<{ ok: true; calendarSync?: { status: string } }>(response),
  );
