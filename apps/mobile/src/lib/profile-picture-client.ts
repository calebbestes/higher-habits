import { mobileApiFetch } from "@/lib/mobile-api";

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

export async function uploadProfilePicture(uri: string): Promise<string> {
  const filename = uri.split("/").pop() ?? "photo.jpg";
  const blob = await uriToBlob(uri);
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await mobileApiFetch("/api/users/profile-picture", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Could not upload photo.");
  }

  const data = (await response.json()) as { imageUrl: string };
  return data.imageUrl;
}
