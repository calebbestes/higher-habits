import type { CalendarBootstrapData } from "./calendar-bootstrap-types";

const ENDPOINT = "/api/calendar-bootstrap";

export type CalendarBootstrapResponse = CalendarBootstrapData;

const parseResponse = async <T>(response: Response) => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
};

export const fetchCalendarBootstrap = async (
  month: string,
): Promise<CalendarBootstrapResponse> => {
  const response = await fetch(
    `${ENDPOINT}?month=${encodeURIComponent(month)}`,
    {
      cache: "no-store",
    },
  );

  return parseResponse<CalendarBootstrapResponse>(response);
};
