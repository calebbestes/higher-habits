import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DISMISSED_SUGGESTIONS_KEY = "day-plan-dismissed-suggestions";

export type DismissedSuggestionsByDate = Record<string, string[]>;

export async function getDismissedSuggestions(): Promise<DismissedSuggestionsByDate> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(DISMISSED_SUGGESTIONS_KEY)
      : await SecureStore.getItemAsync(DISMISSED_SUGGESTIONS_KEY);

  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([dateKey, ids]) =>
        Array.isArray(ids)
          ? [
              [
                dateKey,
                ids.filter((id): id is string => typeof id === "string"),
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export async function setDismissedSuggestions(
  value: DismissedSuggestionsByDate,
) {
  const serialized = JSON.stringify(value);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(DISMISSED_SUGGESTIONS_KEY, serialized);
    return;
  }

  await SecureStore.setItemAsync(DISMISSED_SUGGESTIONS_KEY, serialized);
}
