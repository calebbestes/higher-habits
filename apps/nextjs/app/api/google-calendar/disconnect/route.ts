import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { disconnectGoogleCalendar } from "@/lib/google-calendar";

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const result = await disconnectGoogleCalendar(user.id);

    return NextResponse.json(result);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Could not disconnect Google Calendar." },
      { status: 500 },
    );
  }
}
