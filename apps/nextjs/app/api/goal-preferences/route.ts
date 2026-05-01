import { getDb, goalPreferences } from "@habit/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const db = getDb();

  if (!db) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const rows = await db
    .select()
    .from(goalPreferences)
    .where(eq(goalPreferences.isHidden, true));

  return NextResponse.json({ hiddenKeys: rows.map((r) => r.goalKey) });
}

const setHiddenSchema = z.object({
  goalKey: z.string().min(1).max(80),
  isHidden: z.boolean(),
});

export async function POST(request: Request) {
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
    .values({ goalKey, isHidden, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: goalPreferences.goalKey,
      set: { isHidden, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
