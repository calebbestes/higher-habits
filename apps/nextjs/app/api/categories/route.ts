import { categories, getDb, habits } from "@habit/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(120).default(""),
});
const updateCategorySchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(120).default(""),
});
const deleteCategorySchema = z.object({
  type: z.literal("delete"),
  id: z.string().uuid(),
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

    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id))
      .orderBy(asc(categories.name));

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
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (body.type === "update") {
      const parsed = updateCategorySchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.message },
          { status: 400 },
        );
      }

      const data = parsed.data;
      const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.userId, user.id),
            eq(categories.name, data.name),
            ne(categories.id, data.id),
          ),
        )
        .limit(1);

      if (existing) {
        return NextResponse.json(
          { error: "Category already exists" },
          { status: 409 },
        );
      }

      const [row] = await db
        .update(categories)
        .set({ name: data.name, icon: data.icon })
        .where(and(eq(categories.id, data.id), eq(categories.userId, user.id)))
        .returning();

      if (!row) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(row);
    }

    if (body.type === "delete") {
      const parsed = deleteCategorySchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.message },
          { status: 400 },
        );
      }

      const data = parsed.data;
      const [habit] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(and(eq(habits.categoryId, data.id), eq(habits.userId, user.id)))
        .limit(1);

      if (habit) {
        return NextResponse.json(
          { error: "Move or delete habits in this category first." },
          { status: 409 },
        );
      }

      await db
        .delete(categories)
        .where(and(eq(categories.id, data.id), eq(categories.userId, user.id)));

      return NextResponse.json({ ok: true });
    }

    const parsed = categorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.userId, user.id), eq(categories.name, data.name)),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(categories)
      .values({
        userId: user.id,
        name: data.name,
        icon: data.icon,
      })
      .returning();

    return NextResponse.json(row);
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
