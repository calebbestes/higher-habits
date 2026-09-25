import { useCallback, useEffect, useState } from "react";

import {
  type GoogleCalendar,
  fetchGoogleCalendarSelection,
  fetchGoogleCalendars,
  saveGoogleCalendarSelection,
  updateGoogleCalendarColor,
} from "@/lib/google-calendar-client";

const DEFAULT_SELECTED_CALENDAR_IDS = ["primary"];

type GoogleCalendarSelectionCache = {
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
};

let googleCalendarSelectionCache: GoogleCalendarSelectionCache | null = null;

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function resolvePrimaryCalendarId(
  calendars: GoogleCalendar[],
  calendarId: string,
) {
  if (calendarId !== "primary") return calendarId;
  return calendars.find((calendar) => calendar.primary)?.id ?? calendarId;
}

export function useGoogleCalendarSelection() {
  const [calendars, setCalendars] = useState<GoogleCalendar[]>(
    () => googleCalendarSelectionCache?.calendars ?? [],
  );
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(
    () =>
      googleCalendarSelectionCache?.selectedCalendarIds ??
      DEFAULT_SELECTED_CALENDAR_IDS,
  );
  const [isLoading, setIsLoading] = useState(
    () => googleCalendarSelectionCache === null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(
    () => googleCalendarSelectionCache !== null,
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [calendarResult, selectionResult] = await Promise.all([
        fetchGoogleCalendars(),
        fetchGoogleCalendarSelection(),
      ]);
      const nextCalendars = calendarResult.calendars;
      const nextSelectedIds = selectionResult.visibleGoogleCalendarIds.map(
        (calendarId) => resolvePrimaryCalendarId(nextCalendars, calendarId),
      );
      const uniqueSelectedIds = [...new Set(nextSelectedIds)];

      googleCalendarSelectionCache = {
        calendars: nextCalendars,
        selectedCalendarIds: uniqueSelectedIds,
      };

      setCalendars(nextCalendars);
      setSelectedCalendarIds((currentSelectedIds) =>
        areStringArraysEqual(currentSelectedIds, uniqueSelectedIds)
          ? currentSelectedIds
          : uniqueSelectedIds,
      );
      setLoaded(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load Google calendars.",
      );
      setLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCalendar = useCallback(
    async (calendarId: string) => {
      const nextSelectedIds = selectedCalendarIds.includes(calendarId)
        ? selectedCalendarIds.filter((id) => id !== calendarId)
        : [...selectedCalendarIds, calendarId];

      setSelectedCalendarIds(nextSelectedIds);
      googleCalendarSelectionCache = {
        calendars,
        selectedCalendarIds: nextSelectedIds,
      };
      setIsSaving(true);
      setError(null);
      try {
        await saveGoogleCalendarSelection(nextSelectedIds);
      } catch (saveError) {
        setSelectedCalendarIds(selectedCalendarIds);
        googleCalendarSelectionCache = {
          calendars,
          selectedCalendarIds,
        };
        const message =
          saveError instanceof Error
            ? saveError.message
            : "Could not save calendar selection.";
        setError(message);
        throw saveError;
      } finally {
        setIsSaving(false);
      }
    },
    [calendars, selectedCalendarIds],
  );

  const changeCalendarColor = useCallback(
    async ({
      backgroundColor,
      calendarId,
      foregroundColor,
    }: {
      backgroundColor: string;
      calendarId: string;
      foregroundColor: string;
    }) => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await updateGoogleCalendarColor({
          backgroundColor,
          calendarId,
          foregroundColor,
        });
        if (result.status !== "synced" || !result.calendar) {
          throw new Error(
            result.error ?? `Could not update ${calendarId}'s color.`,
          );
        }
        const updatedCalendar = result.calendar;
        setCalendars((currentCalendars) => {
          const nextCalendars = currentCalendars.map((calendar) =>
            calendar.id === calendarId ? updatedCalendar : calendar,
          );
          if (googleCalendarSelectionCache) {
            googleCalendarSelectionCache = {
              ...googleCalendarSelectionCache,
              calendars: nextCalendars,
            };
          }
          return nextCalendars;
        });
      } catch (changeError) {
        const message =
          changeError instanceof Error
            ? changeError.message
            : "Could not save calendar color.";
        setError(message);
        throw changeError;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  return {
    calendars,
    changeCalendarColor,
    error,
    isLoading,
    isSaving,
    loaded,
    load,
    selectedCalendarIds,
    toggleCalendar,
  };
}
