const ENDPOINT = "/api/goal-photos";

export type GoalPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

export type GoalPhotoWithDate = GoalPhoto & {
  dateKey: string;
  goalId: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(data?.error ?? "Photo request failed");
}

export function fetchGoalPhotos(
  goalId: string,
  dateKey: string,
): Promise<GoalPhoto[]> {
  const query = new URLSearchParams({ goalId, dateKey });
  return fetch(`${ENDPOINT}?${query}`, { cache: "no-store" }).then((response) =>
    parseResponse<GoalPhoto[]>(response),
  );
}

export function fetchGoalPhotosForRange(
  goalId: string | null,
  startDateKey: string,
  endDateKey: string,
): Promise<GoalPhotoWithDate[]> {
  const query = new URLSearchParams({ startDateKey, endDateKey });
  if (goalId) query.set("goalId", goalId);
  return fetch(`${ENDPOINT}?${query}`, { cache: "no-store" }).then((response) =>
    parseResponse<GoalPhotoWithDate[]>(response),
  );
}

export function uploadGoalPhoto(
  goalId: string,
  dateKey: string,
  file: File,
): Promise<GoalPhoto> {
  const formData = new FormData();
  formData.set("goalId", goalId);
  formData.set("dateKey", dateKey);
  formData.set("file", file);

  return fetch(ENDPOINT, {
    method: "POST",
    body: formData,
  }).then((response) => parseResponse<GoalPhoto>(response));
}

export function deleteGoalPhoto(id: string): Promise<{ ok: true }> {
  return fetch(ENDPOINT, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((response) => parseResponse<{ ok: true }>(response));
}
