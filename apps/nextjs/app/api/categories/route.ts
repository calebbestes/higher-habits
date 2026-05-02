import { categories, getDb } from "@habit/db";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return NextResponse.json(rows);
}
