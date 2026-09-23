import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { listGoogleCalendarEventColors } from "@/lib/google-calendar";

export async function GET(request: Request) {
  try {
    await requireRequestUser(request);
    return NextResponse.json(await listGoogleCalendarEventColors());
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      {
        status: "error",
        colors: [],
        calendarColors: [],
        error: "Could not load Google Calendar event colors.",
      },
      { status: 500 },
    );
  }
}
