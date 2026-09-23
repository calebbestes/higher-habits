import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  listGoogleCalendars,
  updateGoogleCalendarColor,
} from "@/lib/google-calendar";

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const updateColorSchema = z.object({
  backgroundColor: colorSchema,
  calendarId: z.string().min(1),
  foregroundColor: colorSchema,
});

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

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const data = updateColorSchema.parse(await request.json());
    return NextResponse.json(
      await updateGoogleCalendarColor({
        backgroundColor: data.backgroundColor,
        calendarId: data.calendarId,
        foregroundColor: data.foregroundColor,
        userId: user.id,
      }),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid calendar color" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { status: "error", error: "Could not update the calendar color." },
      { status: 500 },
    );
  }
}
