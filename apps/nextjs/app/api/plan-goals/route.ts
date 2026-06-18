import { getDb, goals } from "@habit/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const goalFields = {
  title: z.string().trim().min(1).max(200),
};

const createSchema = z.object({ type: z.literal("create"), ...goalFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...goalFields,
});
const deleteSchema = z.object({
  type: z.literal("delete"),
  id: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  deleteSchema,
]);

const selectGoalShape = {
  id: goals.id,
  title: goals.title,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
} as const;

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
      .select(selectGoalShape)
      .from(goals)
      .where(eq(goals.userId, user.id))
      .orderBy(desc(goals.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
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
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const data = parsed.data;

    if (data.type === "create") {
      const [row] = await db
        .insert(goals)
        .values({ userId: user.id, title: data.title })
        .returning(selectGoalShape);

      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      return NextResponse.json(row);
    }

    if (data.type === "update") {
      const [row] = await db
        .update(goals)
        .set({ title: data.title, updatedAt: new Date() })
        .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
        .returning(selectGoalShape);

      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(row);
    }

    await db
      .delete(goals)
      .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
