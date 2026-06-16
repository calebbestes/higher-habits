import { mobileApiFetch } from "@/lib/mobile-api";

export async function recordAppOpened() {
  const response = await mobileApiFetch("/api/users/activity", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Could not record app activity.");
  }
}
