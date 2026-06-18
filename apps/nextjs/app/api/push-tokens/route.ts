import { getDb, pushTokens } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const bodySchema = z.object({
  token: z.string().trim().min(1).max(255),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

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
      .insert(pushTokens)
      .values({
        userId: user.id,
        token: data.token,
        platform: data.platform ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: {
          userId: user.id,
          platform: data.platform ?? null,
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

export async function DELETE(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const data = bodySchema.pick({ token: true }).parse(await request.json());

    await db
      .delete(pushTokens)
      .where(
        and(eq(pushTokens.userId, user.id), eq(pushTokens.token, data.token)),
      );

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
