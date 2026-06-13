import * as SecureStore from "expo-secure-store";
import { Appearance, Platform } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme-preference";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function applyThemePreference(preference: ThemePreference) {
  Appearance.setColorScheme(
    preference === "system" ? "unspecified" : preference,
  );
}

export async function getThemePreference(): Promise<ThemePreference> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);

  return isThemePreference(stored) ? stored : "system";
}

export async function setThemePreference(preference: ThemePreference) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(STORAGE_KEY, preference);
  } else {
    await SecureStore.setItemAsync(STORAGE_KEY, preference);
  }

  applyThemePreference(preference);
}
