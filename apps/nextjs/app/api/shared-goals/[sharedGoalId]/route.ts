import { getDb, sharedGoalParticipants, sharedGoals } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getSharedGoalSnapshots } from "@/lib/shared-goals";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setStatus"),
    status: z.enum(["active", "completed", "archived"]),
  }),
  z.object({ action: z.literal("leave") }),
]);

const getDatabase = () => getDb() ?? null;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sharedGoalId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    const { sharedGoalId } = await params;

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);
    if (!snapshot) {
      return NextResponse.json(
        { error: "Shared goal not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sharedGoalId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    const { sharedGoalId } = await params;

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    if (parsed.data.action === "setStatus") {
      const [updated] = await db
        .update(sharedGoals)
        .set({ status: parsed.data.status, updatedAt: new Date() })
        .where(
          and(
            eq(sharedGoals.id, sharedGoalId),
            eq(sharedGoals.ownerId, user.id),
          ),
        )
        .returning({ id: sharedGoals.id });

      if (!updated) {
        return NextResponse.json(
          { error: "Only the owner can update this shared goal." },
          { status: 403 },
        );
      }
    } else {
      const [sharedGoal] = await db
        .select({ ownerId: sharedGoals.ownerId })
        .from(sharedGoals)
        .where(eq(sharedGoals.id, sharedGoalId))
        .limit(1);

      if (sharedGoal?.ownerId === user.id) {
        return NextResponse.json(
          { error: "Owners archive shared goals instead of leaving them." },
          { status: 400 },
        );
      }

      const [updated] = await db
        .update(sharedGoalParticipants)
        .set({ status: "left", leftAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(sharedGoalParticipants.sharedGoalId, sharedGoalId),
            eq(sharedGoalParticipants.userId, user.id),
          ),
        )
        .returning({ id: sharedGoalParticipants.id });

      if (!updated) {
        return NextResponse.json(
          { error: "Shared goal not found." },
          { status: 404 },
        );
      }
    }

    const [snapshot] = await getSharedGoalSnapshots(db, user.id, sharedGoalId);
    return NextResponse.json(snapshot ?? { ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
