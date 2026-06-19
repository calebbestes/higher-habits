import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getGoogleCalendarConnectionStatus } from "@/lib/google-calendar";

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const status = await getGoogleCalendarConnectionStatus(user.id);

    return NextResponse.json(status);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
