import { friends, getDb, users } from "@habit/db";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

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

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length < 2) {
      return NextResponse.json([]);
    }

    const friendRows = await db
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
      .from(friends)
      .where(or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)));
    const existingUserIds = new Set(
      friendRows.map((row) =>
        row.userId1 === user.id ? row.userId2 : row.userId1,
      ),
    );
    const pattern = `%${query}%`;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(
        and(
          ne(users.id, user.id),
          or(
            sql`lower(${users.name}) like ${pattern}`,
            sql`lower(${users.email}) like ${pattern}`,
          ),
        ),
      )
      .orderBy(asc(users.name))
      .limit(20);

    return NextResponse.json(
      rows
        .filter((row) => !existingUserIds.has(row.id))
        .slice(0, 12)
        .map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
        })),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Could not search users." },
      { status: 500 },
    );
  }
}
