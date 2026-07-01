import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  createGoogleCalendarPrimaryEvent,
  listGoogleCalendarPrimaryEventsForRange,
} from "@/lib/google-calendar";

const querySchema = z.object({
  timeMax: z.string().datetime(),
  timeMin: z.string().datetime(),
  timeZone: z.string().min(1).optional(),
});
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable()
  .default(null);
const createEventSchema = z.object({
  dateKey: dateKeySchema,
  description: z.string().trim().max(20_000).nullable().optional(),
  plannedEndTime: timeSchema,
  plannedStartTime: timeSchema,
  plannedTimeZone: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200),
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

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const data = createEventSchema.parse(await request.json());

    const result = await createGoogleCalendarPrimaryEvent({
      dateKey: data.dateKey,
      description: data.description ?? null,
      plannedEndTime: data.plannedEndTime,
      plannedStartTime: data.plannedStartTime,
      timeZone: data.plannedTimeZone ?? null,
      title: data.title,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
