import { dailyReflectionPosts, getDb } from "@habit/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const rows = await db
      .select({
        prompt: dailyReflectionPosts.prompt,
        answerCount: sql<number>`count(*)::int`,
      })
      .from(dailyReflectionPosts)
      .groupBy(dailyReflectionPosts.prompt);

    return NextResponse.json(rows);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Could not load reflection prompts." },
      { status: 500 },
    );
  }
}
