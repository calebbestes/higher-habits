import { calendarSettings, getDb } from "@habit/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const bodySchema = z.object({
  visibleCategoryIds: z.array(z.string().uuid()),
  monthlyGoalSlots: z.number().int().min(1).max(5),
});

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [row] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, user.id))
      .limit(1);

    return NextResponse.json({
      visibleCategoryIds: row?.visibleCategoryIds ?? [],
      monthlyGoalSlots: row?.monthlyGoalSlots ?? 3,
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const data = bodySchema.parse(await request.json());

    await db
      .insert(calendarSettings)
      .values({
        userId: user.id,
        visibleCategoryIds: data.visibleCategoryIds,
        monthlyGoalSlots: data.monthlyGoalSlots,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: calendarSettings.userId,
        set: {
          visibleCategoryIds: data.visibleCategoryIds,
          monthlyGoalSlots: data.monthlyGoalSlots,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
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
