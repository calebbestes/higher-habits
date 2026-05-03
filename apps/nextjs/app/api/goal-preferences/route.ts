import { getDb, goalPreferences } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const setHiddenSchema = z.object({
  goalKey: z.string().min(1).max(80),
  isHidden: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
    }

    const rows = await db
      .select()
      .from(goalPreferences)
      .where(
        and(eq(goalPreferences.userId, user.id), eq(goalPreferences.isHidden, true)),
      );

    return NextResponse.json({ hiddenKeys: rows.map((row) => row.goalKey) });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body: unknown = await request.json();
    const parsed = setHiddenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const db = getDb();

    if (!db) {
      return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
    }

    const { goalKey, isHidden } = parsed.data;

    await db
      .insert(goalPreferences)
      .values({
        userId: user.id,
        goalKey,
        isHidden,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [goalPreferences.userId, goalPreferences.goalKey],
        set: { isHidden, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
