import { friends, getDb, users } from "@habit/db";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const getDatabase = () => getDb() ?? null;
export const dynamic = "force-dynamic";

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

    const existingFriendRows = await db
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
      .from(friends)
      .where(or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)));
    const existingUserIds = new Set(
      existingFriendRows.map((row) =>
        row.userId1 === user.id ? row.userId2 : row.userId1,
      ),
    );
    const acceptedFriendRows = await db
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
      .from(friends)
      .where(
        and(
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
        ),
      );
    const acceptedFriendIds = acceptedFriendRows.map((row) =>
      row.userId1 === user.id ? row.userId2 : row.userId1,
    );
    const mutualCounts = new Map<string, number>();

    if (acceptedFriendIds.length > 0) {
      const mutualFriendRows = await db
        .select({ userId1: friends.userId1, userId2: friends.userId2 })
        .from(friends)
        .where(
          and(
            eq(friends.status, "accepted"),
            or(
              inArray(friends.userId1, acceptedFriendIds),
              inArray(friends.userId2, acceptedFriendIds),
            ),
          ),
        );
      const acceptedFriendIdSet = new Set(acceptedFriendIds);

      for (const row of mutualFriendRows) {
        const firstIsMutual = acceptedFriendIdSet.has(row.userId1);
        const secondIsMutual = acceptedFriendIdSet.has(row.userId2);
        if (firstIsMutual === secondIsMutual) continue;

        const candidateId = firstIsMutual ? row.userId2 : row.userId1;
        if (candidateId === user.id || existingUserIds.has(candidateId)) {
          continue;
        }
        mutualCounts.set(candidateId, (mutualCounts.get(candidateId) ?? 0) + 1);
      }
    }

    const pattern = `%${query}%`;
    const searchFilter =
      query.length >= 2
        ? or(
            sql`lower(${users.name}) like ${pattern}`,
            sql`lower(${users.email}) like ${pattern}`,
          )
        : undefined;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(
        searchFilter
          ? and(ne(users.id, user.id), searchFilter)
          : ne(users.id, user.id),
      )
      .orderBy(asc(users.name))
      .limit(query.length >= 2 ? 50 : 100);

    return NextResponse.json(
      rows
        .filter((row) => !existingUserIds.has(row.id))
        .sort(
          (left, right) =>
            (mutualCounts.get(right.id) ?? 0) -
              (mutualCounts.get(left.id) ?? 0) ||
            left.name.localeCompare(right.name),
        )
        .map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
          mutualFriendCount: mutualCounts.get(row.id) ?? 0,
        })),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
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
