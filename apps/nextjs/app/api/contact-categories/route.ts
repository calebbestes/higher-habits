import { contactCategories, getDb } from "@habit/db";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const bodySchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function GET(request: Request) {
  try {
    await requireRequestUser(request);
    const db = getDb();
    if (!db)
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );

    const rows = await db
      .select()
      .from(contactCategories)
      .orderBy(asc(contactCategories.name));
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
    await requireRequestUser(request);
    const db = getDb();
    if (!db)
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );

    const body: unknown = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );

    const [row] = await db
      .insert(contactCategories)
      .values({ name: parsed.data.name })
      .onConflictDoNothing()
      .returning();

    if (!row)
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 409 },
      );
    return NextResponse.json(row);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
