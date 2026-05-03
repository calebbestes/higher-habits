import { categories, getDb } from "@habit/db";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(120).default(""),
});

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
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

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const body: unknown = await request.json();
    const parsed = categorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const data = parsed.data;
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, user.id), eq(categories.name, data.name)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
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

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
