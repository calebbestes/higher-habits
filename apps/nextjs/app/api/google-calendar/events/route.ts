import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { listGoogleCalendarPrimaryEventsForRange } from "@/lib/google-calendar";

const querySchema = z.object({
  timeMax: z.string().datetime(),
  timeMin: z.string().datetime(),
  timeZone: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      timeMax: url.searchParams.get("timeMax"),
      timeMin: url.searchParams.get("timeMin"),
      timeZone: url.searchParams.get("timeZone") ?? undefined,
    });

    const result = await listGoogleCalendarPrimaryEventsForRange({
      timeMax: query.timeMax,
      timeMin: query.timeMin,
      timeZone: query.timeZone,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
