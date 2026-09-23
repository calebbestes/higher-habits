import { useEffect, useState } from "react";

import {
  type GoogleCalendarEventColor,
  fetchGoogleCalendarColors,
} from "@/lib/google-calendar-client";

export function useGoogleCalendarColors() {
  const [colors, setColors] = useState<GoogleCalendarEventColor[]>([]);
  const [calendarColors, setCalendarColors] = useState<
    GoogleCalendarEventColor[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchGoogleCalendarColors()
      .then((result) => {
        if (mounted) {
          setCalendarColors(result.calendarColors);
          setColors(result.colors);
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { calendarColors, colors, isLoading };
}

export function useGoogleCalendarEventColors() {
  const { colors, isLoading } = useGoogleCalendarColors();
  return { colors, isLoading };
}
