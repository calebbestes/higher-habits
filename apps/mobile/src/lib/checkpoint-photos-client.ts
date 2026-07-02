import type { GoalPhotoUpload } from "@/lib/goal-photos-client";
import { mobileApiFetch } from "@/lib/mobile-api";

export type CheckpointPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
  checkpointId: string;
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

export function fetchCheckpointPhotos(
  checkpointId: string,
): Promise<CheckpointPhoto[]> {
  const query = new URLSearchParams({ checkpointId });
  return mobileApiFetch(`/api/checkpoint-photos?${query}`).then((response) =>
    parseResponse<CheckpointPhoto[]>(response),
  );
}

export function fetchAllCheckpointPhotos(): Promise<CheckpointPhoto[]> {
  return mobileApiFetch("/api/checkpoint-photos?all=true").then((response) =>
    parseResponse<CheckpointPhoto[]>(response),
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

export async function uploadCheckpointPhoto(
  checkpointId: string,
  photo: GoalPhotoUpload,
): Promise<CheckpointPhoto> {
  const blob = photo.file ?? (await uriToBlob(photo.uri));

  const formData = new FormData();
  formData.append("checkpointId", checkpointId);
  formData.append("file", blob, photo.name);

  return mobileApiFetch("/api/checkpoint-photos", {
    method: "POST",
    body: formData,
  }).then((response) => parseResponse<CheckpointPhoto>(response));
}

export function deleteCheckpointPhoto(id: string): Promise<{ ok: true }> {
  return mobileApiFetch("/api/checkpoint-photos", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  }).then((response) => parseResponse<{ ok: true }>(response));
}
