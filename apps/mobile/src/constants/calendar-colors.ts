export const CALENDAR_CATEGORY_COLORS: Record<string, string> = {
  Spiritual: "#2C5352",
  Physical: "#9D7474",
  Work: "#516162",
  Social: "#16858A",
  "Hobbies/Social": "#16858A",
  "Financial/Career": "#C75D6B",
};

export const DEFAULT_CALENDAR_COLOR = "#516162";

export const CALENDAR_TYPE_COLORS = {
  goal: "#7B61A8",
  habit: "#2F9FC0",
  other: "#65737E",
  task: "#2D7DD2",
} as const;

export const CALENDAR_EVENT_COLORS = [
  { label: "Default", color: null, foreground: null },
  { label: "Sage", color: "#33B679", foreground: "#07171D" },
  { label: "Flamingo", color: "#E67C73", foreground: "#1A090A" },
  { label: "Mango", color: "#F09300", foreground: "#211203" },
  { label: "Cobalt", color: "#4285F4", foreground: "#FFFFFF" },
  { label: "Eucalyptus", color: "#009688", foreground: "#FFFFFF" },
  { label: "Cherry Blossom", color: "#D81B60", foreground: "#FFFFFF" },
  { label: "Banana", color: "#F6BF26", foreground: "#211203" },
  { label: "Peacock", color: "#039BE5", foreground: "#FFFFFF" },
  { label: "Grape", color: "#8E24AA", foreground: "#FFFFFF" },
  { label: "Graphite", color: "#616161", foreground: "#FFFFFF" },
  { label: "Tomato", color: "#D50000", foreground: "#FFFFFF" },
] as const;

export function getCalendarEventForeground(
  color?: string | null,
  fallback = "#FFFFFF",
) {
  return (
    CALENDAR_EVENT_COLORS.find((option) => option.color === color)
      ?.foreground ?? fallback
  );
}

const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  "1": "#7986CB",
  "2": "#33B679",
  "3": "#8E24AA",
  "4": "#E67C73",
  "5": "#F6BF26",
  "6": "#F4511E",
  "7": "#039BE5",
  "8": "#616161",
  "9": "#3F51B5",
  "10": "#0B8043",
  "11": "#D50000",
};

export const DEFAULT_GOOGLE_CALENDAR_COLOR = "#4285F4";

export function getCalendarCategoryColor(categoryName?: string | null) {
  return categoryName
    ? (CALENDAR_CATEGORY_COLORS[categoryName] ?? DEFAULT_CALENDAR_COLOR)
    : DEFAULT_CALENDAR_COLOR;
}

export function getCalendarTypeColor(kind: keyof typeof CALENDAR_TYPE_COLORS) {
  return CALENDAR_TYPE_COLORS[kind];
}

export function getGoogleCalendarColor(colorId?: string | null) {
  return colorId
    ? (GOOGLE_CALENDAR_COLORS[colorId] ?? DEFAULT_GOOGLE_CALENDAR_COLOR)
    : DEFAULT_GOOGLE_CALENDAR_COLOR;
}

export function getGoogleCalendarEventColor(
  colorId?: string | null,
  backgroundColor?: string | null,
) {
  const normalizedBackground = backgroundColor?.trim().toLowerCase();
  const matchingAppColor = CALENDAR_EVENT_COLORS.find(
    (option) => option.color?.toLowerCase() === normalizedBackground,
  )?.color;

  // Prefer Google's modern RGB value when it matches a color shown in Float.
  if (matchingAppColor) return matchingAppColor;

  return colorId && GOOGLE_CALENDAR_COLORS[colorId]
    ? GOOGLE_CALENDAR_COLORS[colorId]
    : (backgroundColor ?? DEFAULT_GOOGLE_CALENDAR_COLOR);
}
