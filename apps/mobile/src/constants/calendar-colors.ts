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
