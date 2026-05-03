import { NextResponse } from "next/server";
import { z } from "zod";

import { getCalendarBootstrap } from "@/lib/calendar-bootstrap";

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

const querySchema = z.object({
  month: z.string().regex(MONTH_KEY_REGEX, "Month must be YYYY-MM"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { month } = querySchema.parse({
      month: url.searchParams.get("month"),
    });

    return NextResponse.json(await getCalendarBootstrap(month));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message === "Database is not configured."
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
