import { mobileApiFetch } from "@/lib/mobile-api";

export type WeeklyPlanNote = {
  weekStartDate: string;
  notes: string;
};

export type WeeklyPlanNoteHeader = {
  id: string;
  text: string;
  updatedAt: string;
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

export const fetchWeeklyPlanNote = (weekStartDate: string) =>
  mobileApiFetch(
    `/api/weekly-plan-notes?weekStartDate=${encodeURIComponent(weekStartDate)}`,
  ).then((response) => parseResponse<WeeklyPlanNote>(response));

export const fetchWeeklyPlanNoteHeaders = () =>
  mobileApiFetch("/api/weekly-plan-note-headers").then((response) =>
    parseResponse<WeeklyPlanNoteHeader[]>(response),
  );

export const saveWeeklyPlanNote = ({
  notes,
  weekStartDate,
}: {
  notes: string;
  weekStartDate: string;
}) =>
  mobileApiFetch("/api/weekly-plan-notes", {
    method: "POST",
    body: JSON.stringify({ notes, weekStartDate }),
  }).then((response) => parseResponse<WeeklyPlanNote>(response));
