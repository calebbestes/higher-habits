import { getDb, projects, tasks } from "@habit/db";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
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
const renameSchema = z.object({
  type: z.literal("rename"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});
const pinSchema = z.object({
  type: z.literal("pin"),
  id: z.string().uuid(),
  pinned: z.boolean(),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  deleteSchema,
  renameSchema,
  pinSchema,
]);

const getDatabase = () => getDb() ?? null;

function projectSummarySelect() {
  return {
    id: projects.id,
    name: projects.name,
    color: projects.color,
    pinned: projects.pinned,
    createdAt: projects.createdAt,
    totalTasks: count(tasks.id),
    completedTasks: count(tasks.completedAt),
  };
}

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
      .select(projectSummarySelect())
      .from(projects)
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .where(eq(projects.userId, user.id))
      .groupBy(projects.id)
      .orderBy(desc(projects.pinned), asc(projects.name));

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
        const [existingProject] = await db
          .select(projectSummarySelect())
          .from(projects)
          .leftJoin(tasks, eq(tasks.projectId, projects.id))
          .where(
            and(eq(projects.userId, user.id), eq(projects.name, data.name)),
          )
          .groupBy(projects.id);

        if (existingProject) return NextResponse.json(existingProject);

        return NextResponse.json(
          { error: "Project already exists." },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ...row,
        pinned: row.pinned,
        totalTasks: 0,
        completedTasks: 0,
      });
    }

    if (data.type === "rename") {
      const [duplicate] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, user.id),
            eq(projects.name, data.name),
            ne(projects.id, data.id),
          ),
        )
        .limit(1);

      if (duplicate) {
        return NextResponse.json(
          { error: "A project with that name already exists." },
          { status: 409 },
        );
      }

      const [updated] = await db
        .update(projects)
        .set({ name: data.name, updatedAt: new Date() })
        .where(and(eq(projects.id, data.id), eq(projects.userId, user.id)))
        .returning({ id: projects.id });

      if (!updated) {
        return NextResponse.json(
          { error: "Project not found." },
          { status: 404 },
        );
      }

      const [summary] = await db
        .select(projectSummarySelect())
        .from(projects)
        .leftJoin(tasks, eq(tasks.projectId, projects.id))
        .where(eq(projects.id, updated.id))
        .groupBy(projects.id);

      return NextResponse.json(summary);
    }

    if (data.type === "pin") {
      const [updated] = await db
        .update(projects)
        .set({ pinned: data.pinned, updatedAt: new Date() })
        .where(and(eq(projects.id, data.id), eq(projects.userId, user.id)))
        .returning({ id: projects.id });

      if (!updated) {
        return NextResponse.json(
          { error: "Project not found." },
          { status: 404 },
        );
      }

      const [summary] = await db
        .select(projectSummarySelect())
        .from(projects)
        .leftJoin(tasks, eq(tasks.projectId, projects.id))
        .where(eq(projects.id, updated.id))
        .groupBy(projects.id);

      return NextResponse.json(summary);
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
