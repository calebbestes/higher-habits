import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { mobileApiFetch } from "@/lib/mobile-api";

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/**
 * Requests notification permission (if needed), retrieves the Expo push token,
 * and registers it with the backend. Safe to call on every launch; no-ops on
 * simulators and when permission is denied.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = getProjectId();
    if (!projectId) return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await mobileApiFetch("/api/push-tokens", {
      method: "POST",
      body: JSON.stringify({
        token: tokenResponse.data,
        platform: Platform.OS,
      }),
    });
  } catch {
    // Push registration is best-effort; never block app startup.
  }
}
