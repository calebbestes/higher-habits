import { mobileApiFetch } from "@/lib/mobile-api";

export type PlanNotePeriod = "daily" | "monthly";

export type PlanNote = {
  dateKey: string;
  notes: string;
  period: PlanNotePeriod;
  updatedAt: string | null;
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

export const fetchPlanNote = ({
  dateKey,
  period,
}: {
  dateKey: string;
  period: PlanNotePeriod;
}) => {
  const params = new URLSearchParams({ dateKey, period });
  return mobileApiFetch(`/api/plan-notes?${params.toString()}`).then(
    (response) => parseResponse<PlanNote>(response),
  );
};

export const fetchPlanNotes = ({
  month,
  period,
  year,
}: {
  month?: number;
  period: PlanNotePeriod;
  year?: number;
}) => {
  const params = new URLSearchParams({ period });
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));
  return mobileApiFetch(`/api/plan-notes?${params.toString()}`).then(
    (response) => parseResponse<PlanNote[]>(response),
  );
};

export const savePlanNote = ({
  dateKey,
  notes,
  period,
}: {
  dateKey: string;
  notes: string;
  period: PlanNotePeriod;
}) =>
  mobileApiFetch("/api/plan-notes", {
    method: "POST",
    body: JSON.stringify({ dateKey, notes, period }),
  }).then((response) => parseResponse<PlanNote>(response));
