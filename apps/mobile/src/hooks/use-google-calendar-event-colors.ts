import { useEffect, useState } from "react";

import { CALENDAR_EVENT_COLORS } from "@/constants/calendar-colors";
import {
  type GoogleCalendarEventColor,
  fetchGoogleCalendarColors,
} from "@/lib/google-calendar-client";

const GOOGLE_EVENT_COLOR_FALLBACK: GoogleCalendarEventColor[] =
  CALENDAR_EVENT_COLORS.filter(
    (option): option is typeof option & { color: string; colorId: string } =>
      Boolean(option.color && option.colorId),
  ).map((option) => ({
    backgroundColor: option.color,
    colorId: option.colorId,
    foregroundColor: option.foreground ?? "#FFFFFF",
    label: option.label,
  }));

// CalendarList uses Google's calendar palette, which is narrower than the
// event palette. In particular, event colors such as Mango are not valid
// calendar colors.
const GOOGLE_CALENDAR_COLOR_FALLBACK: GoogleCalendarEventColor[] = [
  ["1", "#7986CB", "#FFFFFF"],
  ["2", "#33B679", "#FFFFFF"],
  ["3", "#8E24AA", "#FFFFFF"],
  ["4", "#E67C73", "#1D1D1D"],
  ["5", "#F6BF26", "#1D1D1D"],
  ["6", "#F4511E", "#FFFFFF"],
  ["7", "#039BE5", "#FFFFFF"],
  ["8", "#616161", "#FFFFFF"],
  ["9", "#3F51B5", "#FFFFFF"],
  ["10", "#0B8043", "#FFFFFF"],
  ["11", "#D50000", "#FFFFFF"],
].map(([colorId, backgroundColor, foregroundColor]) => ({
  backgroundColor,
  colorId,
  foregroundColor,
}));

function getGoogleEventPalette(
  eventLabels: GoogleCalendarEventColor[],
): GoogleCalendarEventColor[] {
  const labelsByBackground = new Map(
    eventLabels.map((label) => [label.backgroundColor.toLowerCase(), label]),
  );

  return GOOGLE_EVENT_COLOR_FALLBACK.map((fallbackColor) => {
    const eventLabel = labelsByBackground.get(
      fallbackColor.backgroundColor.toLowerCase(),
    );
    return eventLabel
      ? { ...fallbackColor, colorId: eventLabel.colorId }
      : fallbackColor;
  });
}

export function useGoogleCalendarColors() {
  const [colors, setColors] = useState<GoogleCalendarEventColor[]>([]);
  const [calendarColors, setCalendarColors] = useState<
    GoogleCalendarEventColor[]
  >([]);
  const [eventLabels, setEventLabels] = useState<GoogleCalendarEventColor[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchGoogleCalendarColors()
      .then((result) => {
        if (mounted) {
          setCalendarColors(
            result.calendarColors?.length
              ? result.calendarColors
              : GOOGLE_CALENDAR_COLOR_FALLBACK,
          );
          setColors(result.colors ?? []);
          setEventLabels(getGoogleEventPalette(result.eventLabels ?? []));
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { calendarColors, colors, eventLabels, isLoading };
}

export function useGoogleCalendarEventColors() {
  const { eventLabels, isLoading } = useGoogleCalendarColors();
  return {
    colors: eventLabels.length > 0 ? eventLabels : GOOGLE_EVENT_COLOR_FALLBACK,
    isLoading,
  };
}
