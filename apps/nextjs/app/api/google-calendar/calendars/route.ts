import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { listGoogleCalendars } from "@/lib/google-calendar";

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    return NextResponse.json(await listGoogleCalendars(user.id));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { status: "error", calendars: [] },
      { status: 500 },
    );
  }
}
