import { Platform } from "react-native";

import { AUTH_BASE_URL, authClient } from "@/lib/auth-client";

export async function mobileApiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (Platform.OS !== "web") {
    const cookie = authClient.getCookie();
    if (cookie) headers.set("Cookie", cookie);
  }

  const response = await fetch(`${AUTH_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    await authClient.signOut();
  }

  return response;
}
