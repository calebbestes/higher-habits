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
          setCalendarColors(GOOGLE_EVENT_COLOR_FALLBACK);
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
