import { categories, getDb, goalCheckpoints, goals, tasks } from "@habit/db";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  getPlannedEventsForUser,
  serializePlannedEvent,
} from "@/lib/planned-events";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.discriminatedUnion("view", [
  z.object({
    view: z.literal("day"),
    dateKey: dateKeySchema,
  }),
  z.object({
    view: z.literal("week"),
    startDateKey: dateKeySchema,
    endDateKey: dateKeySchema,
  }),
]);

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
    const view = url.searchParams.get("view");
    const query =
      view === "week"
        ? querySchema.parse({
            view,
            startDateKey: url.searchParams.get("startDateKey"),
            endDateKey: url.searchParams.get("endDateKey"),
          })
        : querySchema.parse({
            view: "day",
            dateKey: url.searchParams.get("dateKey"),
          });

    const plannedRows = await getPlannedEventsForUser(db, {
      dateKey: query.view === "day" ? query.dateKey : null,
      endDateKey: query.view === "week" ? query.endDateKey : null,
      startDateKey: query.view === "week" ? query.startDateKey : null,
      userId: user.id,
    });
    const response: {
      plannedEvents: ReturnType<typeof serializePlannedEvent>[];
      tasks?: (typeof tasks.$inferSelect)[];
      planGoals?: Array<{
        id: string;
        title: string;
        timing: "current" | "later";
        sortOrder: number;
        checkpoints: Array<{
          id: string;
          title: string;
          targetDate: string | null;
          sortOrder: number;
          completed: boolean;
          completedAt: string | null;
          notes: string | null;
          visibility: string;
          createdAt: string;
          updatedAt: string;
        }>;
        createdAt: string;
        updatedAt: string;
      }>;
      habitCategories?: (typeof categories.$inferSelect)[];
    } = {
      plannedEvents: plannedRows.map(serializePlannedEvent),
    };

    if (query.view === "day") {
      const [taskRows, categoryRows, goalRows, checkpointRows] =
        await Promise.all([
          db
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, user.id),
                or(
                  isNull(tasks.completedAt),
                  eq(tasks.completedAt, query.dateKey),
                ),
              ),
            )
            .orderBy(desc(tasks.createdAt)),
          db
            .select()
            .from(categories)
            .where(eq(categories.userId, user.id))
            .orderBy(asc(categories.name)),
          db
            .select()
            .from(goals)
            .where(eq(goals.userId, user.id))
            .orderBy(asc(goals.sortOrder), asc(goals.createdAt)),
          db
            .select()
            .from(goalCheckpoints)
            .where(eq(goalCheckpoints.userId, user.id))
            .orderBy(
              asc(goalCheckpoints.sortOrder),
              asc(goalCheckpoints.createdAt),
            ),
        ]);

      response.tasks = taskRows;
      response.habitCategories = categoryRows;
      response.planGoals = goalRows.map((goal) => ({
        id: goal.id,
        title: goal.title,
        timing: goal.timing === "later" ? "later" : "current",
        sortOrder: goal.sortOrder,
        checkpoints: checkpointRows
          .filter((checkpoint) => checkpoint.goalId === goal.id)
          .map((checkpoint) => ({
            id: checkpoint.id,
            title: checkpoint.title,
            targetDate: checkpoint.targetDate,
            sortOrder: checkpoint.sortOrder,
            completed: Boolean(checkpoint.completedAt),
            completedAt: checkpoint.completedAt?.toISOString() ?? null,
            notes: checkpoint.notes,
            visibility: checkpoint.visibility,
            createdAt: checkpoint.createdAt.toISOString(),
            updatedAt: checkpoint.updatedAt.toISOString(),
          })),
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
      }));
    }

    return NextResponse.json(response);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load plan" },
      { status: 500 },
    );
  }
}
