import { getDb, projects, tasks } from "@habit/db";
import { and, asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const createSchema = z.object({
  type: z.literal("create"),
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(20).default(""),
});
const deleteSchema = z.object({
  type: z.literal("delete"),
  id: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("type", [createSchema, deleteSchema]);

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
        id: projects.id,
        name: projects.name,
        color: projects.color,
        createdAt: projects.createdAt,
        totalTasks: count(tasks.id),
        completedTasks: count(tasks.completedAt),
      })
      .from(projects)
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .where(eq(projects.userId, user.id))
      .groupBy(projects.id)
      .orderBy(asc(projects.name));

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

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }
    const data = parsed.data;

    if (data.type === "create") {
      const [row] = await db
        .insert(projects)
        .values({ userId: user.id, name: data.name, color: data.color })
        .onConflictDoNothing()
        .returning();

      if (!row) {
        return NextResponse.json(
          { error: "A project with that name already exists." },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ...row,
        totalTasks: 0,
        completedTasks: 0,
      });
    }

    await db
      .delete(projects)
      .where(and(eq(projects.id, data.id), eq(projects.userId, user.id)));

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
