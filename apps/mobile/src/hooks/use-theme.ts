/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from "react";

import { ColorThemeOptions, Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColorThemePreference } from "@/lib/theme-preference";

export function useTheme() {
  const scheme = useColorScheme();
  const colorThemePreference = useColorThemePreference();
  const theme = scheme === "unspecified" ? "light" : scheme;

  return useMemo(
    () => ({
      ...Colors[theme],
      ...ColorThemeOptions[colorThemePreference].colors,
    }),
    [colorThemePreference, theme],
  );
}
