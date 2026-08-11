const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"];

export const GOOGLE_CALENDAR_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/calendar.events",
];
