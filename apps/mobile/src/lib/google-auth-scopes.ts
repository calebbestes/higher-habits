export const GOOGLE_SIGN_IN_SCOPES = ["openid", "email", "profile"];

export const GOOGLE_CALENDAR_SCOPES = [
  ...GOOGLE_SIGN_IN_SCOPES,
  "https://www.googleapis.com/auth/calendar.events",
];
