import { getDb, moderationReports } from "@habit/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const reportSchema = z.object({
  targetType: z.enum(["feed_post", "feed_comment", "user", "ad", "general"]),
  targetId: z.string().trim().min(1).max(200).optional(),
  reason: z.string().trim().min(1).max(1_000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const parsed = reportSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const context = {
      ...(parsed.data.context ?? {}),
      requestUserAgent: request.headers.get("user-agent"),
    };

    await db.insert(moderationReports).values({
      context,
      reason: parsed.data.reason,
      reporterId: user.id,
      targetId: parsed.data.targetId ?? null,
      targetType: parsed.data.targetType,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
