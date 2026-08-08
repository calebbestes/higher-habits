import { getDb, weeklyPlanNoteHeaders } from "@habit/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const getDatabase = () => getDb() ?? null;

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const rows = await db
      .select({
        id: weeklyPlanNoteHeaders.id,
        text: weeklyPlanNoteHeaders.text,
        updatedAt: weeklyPlanNoteHeaders.updatedAt,
      })
      .from(weeklyPlanNoteHeaders)
      .where(eq(weeklyPlanNoteHeaders.userId, user.id))
      .orderBy(desc(weeklyPlanNoteHeaders.updatedAt));

    return NextResponse.json(rows);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
