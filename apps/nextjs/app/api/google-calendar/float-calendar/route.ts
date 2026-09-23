import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { ensureFloatGoogleCalendar } from "@/lib/google-calendar";

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    return NextResponse.json(await ensureFloatGoogleCalendar(user.id));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { status: "error", error: "Could not create the Float calendar." },
      { status: 500 },
    );
  }
}
