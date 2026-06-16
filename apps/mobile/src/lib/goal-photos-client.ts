import { mobileApiFetch } from "@/lib/mobile-api";

export type GoalPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
  dateKey: string;
  goalId: string;
};

export type GoalPhotoUpload = {
  uri: string;
  name: string;
  type: string;
  file?: File;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Could not load photos.");
  }

  return response.json() as Promise<T>;
}

export function fetchGoalPhotosForRange(
  goalId: string | null,
  startDateKey: string,
  endDateKey: string,
): Promise<GoalPhoto[]> {
  const query = new URLSearchParams({ startDateKey, endDateKey });
  if (goalId) query.set("goalId", goalId);

  return mobileApiFetch(`/api/goal-photos?${query}`).then((response) =>
    parseResponse<GoalPhoto[]>(response),
  );
}

export function fetchAllGoalPhotos(
  goalId: string | null,
): Promise<GoalPhoto[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const toDateKey = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const query = new URLSearchParams({
    all: "true",
    startDateKey: toDateKey(1),
    endDateKey: toDateKey(new Date(year, month + 1, 0).getDate()),
  });
  if (goalId) query.set("goalId", goalId);

  return mobileApiFetch(`/api/goal-photos?${query}`).then((response) =>
    parseResponse<GoalPhoto[]>(response),
  );
}

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = reject;
    xhr.responseType = "blob";
    xhr.open("GET", uri);
    xhr.send();
  });
}

export async function uploadGoalPhoto(
  goalId: string,
  dateKey: string,
  photo: GoalPhotoUpload,
): Promise<GoalPhoto> {
  const blob = photo.file ?? (await uriToBlob(photo.uri));

  const formData = new FormData();
  formData.append("goalId", goalId);
  formData.append("dateKey", dateKey);
  formData.append("file", blob, photo.name);

  return mobileApiFetch("/api/goal-photos", {
    method: "POST",
    body: formData,
  }).then((response) => parseResponse<GoalPhoto>(response));
}
