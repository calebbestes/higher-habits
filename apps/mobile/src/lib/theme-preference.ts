import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Appearance, Platform } from "react-native";

import {
  ColorThemeOptions,
  type ColorThemePreference,
  DefaultColorThemePreference,
} from "@/constants/theme";

export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "theme-preference";
const COLOR_THEME_STORAGE_KEY = "color-theme-preference";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

function createPreferenceStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const colorThemeStore = createPreferenceStore<ColorThemePreference>(
  DefaultColorThemePreference,
);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isColorThemePreference(
  value: string | null,
): value is ColorThemePreference {
  return Boolean(value && value in ColorThemeOptions);
}

async function getStoredPreference(key: string): Promise<string | null> {
  return Platform.OS === "web"
    ? globalThis.localStorage?.getItem(key)
    : await SecureStore.getItemAsync(key);
}

async function setStoredPreference(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export function applyThemePreference(preference: ThemePreference) {
  Appearance.setColorScheme(
    preference === "system" ? "unspecified" : preference,
  );
}

export function applyColorThemePreference(preference: ColorThemePreference) {
  colorThemeStore.set(preference);
}

export function useColorThemePreference(): ColorThemePreference {
  return useSyncExternalStore(
    colorThemeStore.subscribe,
    colorThemeStore.get,
    colorThemeStore.get,
  );
}

export async function getThemePreference(): Promise<ThemePreference> {
  const stored = await getStoredPreference(THEME_STORAGE_KEY);

  return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
}

export async function getColorThemePreference(): Promise<ColorThemePreference> {
  const stored = await getStoredPreference(COLOR_THEME_STORAGE_KEY);

  return isColorThemePreference(stored) ? stored : DefaultColorThemePreference;
}

export async function setThemePreference(preference: ThemePreference) {
  await setStoredPreference(THEME_STORAGE_KEY, preference);

  applyThemePreference(preference);
}

export async function setColorThemePreference(
  preference: ColorThemePreference,
) {
  await setStoredPreference(COLOR_THEME_STORAGE_KEY, preference);

  applyColorThemePreference(preference);
}
