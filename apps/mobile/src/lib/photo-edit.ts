import { SaveFormat, manipulateAsync } from "expo-image-manipulator";

import type { GoalPhotoUpload } from "@/lib/goal-photos-client";

// expo-image-manipulator only accepts a local file or a base64 data URI as its
// source — not a remote URL. Journal photos live behind short-lived signed
// Supabase URLs, so we fetch the bytes and hand the manipulator a data URI.
function fetchAsBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error("Could not load the photo to edit."));
    xhr.responseType = "blob";
    xhr.open("GET", uri);
    xhr.send();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read the photo to edit."));
      }
    };
    reader.onerror = () =>
      reject(new Error("Could not read the photo to edit."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads a remote photo, rotates it clockwise by `degrees`, and returns an
 * upload payload for the rotated JPEG. Callers upload the result as a new photo
 * and delete the original, since there is no in-place replace endpoint.
 */
export async function rotateRemotePhoto(
  remoteUrl: string,
  degrees: number,
): Promise<GoalPhotoUpload> {
  const blob = await fetchAsBlob(remoteUrl);
  const dataUri = await blobToDataUrl(blob);

  const result = await manipulateAsync(dataUri, [{ rotate: degrees }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    name: `goal-photo-${Date.now()}.jpg`,
    type: "image/jpeg",
  };
}
