import { Platform } from "react-native";

import { AUTH_BASE_URL, authClient } from "@/lib/auth-client";
import { addCrashBreadcrumb } from "@/lib/crash-reporting";

export async function mobileApiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const isNative = Platform.OS !== "web";
  let hasStoredCookie = false;
  headers.set("Accept", "application/json");

  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("X-Client-Time-Zone")) {
    const timeZone = getDeviceTimeZone();
    if (timeZone) headers.set("X-Client-Time-Zone", timeZone);
  }

  if (isNative) {
    const cookie = authClient.getCookie();
    hasStoredCookie = Boolean(cookie);
    if (hasStoredCookie) headers.set("Cookie", cookie);
  }

  const response = await fetch(`${AUTH_BASE_URL}${path}`, {
    ...init,
    // Native auth cookies come from SecureStore. Letting the native cookie jar
    // participate can replace or suppress the cookie set above.
    credentials: isNative ? "omit" : "include",
    headers,
  });

  if (response.status === 401) {
    addCrashBreadcrumb("Mobile API request unauthorized", {
      hasStoredCookie,
      method: init?.method ?? "GET",
      path,
    });
  }

  return response;
}

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
