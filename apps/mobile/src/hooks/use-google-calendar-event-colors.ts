import { useEffect, useState } from "react";

import {
  type GoogleCalendarEventColor,
  fetchGoogleCalendarEventColors,
} from "@/lib/google-calendar-client";

export function useGoogleCalendarEventColors() {
  const [colors, setColors] = useState<GoogleCalendarEventColor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchGoogleCalendarEventColors()
      .then((nextColors) => {
        if (mounted) setColors(nextColors);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { colors, isLoading };
}
