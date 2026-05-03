import {
  calendarDayHabits,
  customDayIconSelections,
  dayDrawerNotes,
  getDb,
  prayerDayChecklists,
  salesDayChecklists,
  salesOutreachActivities,
  weightDayChecklists,
} from "@habit/db";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  CALENDAR_HABIT_KEYS,
  CUSTOM_DAY_ICON_KEYS,
  CUSTOM_DAY_ICON_STATUSES,
  DRAWER_NOTE_KEYS,
  EMPTY_DAY_DRAWER_NOTES,
  EMPTY_PRAYER_CHECKLIST,
  EMPTY_SALES_CHECKLIST,
  EMPTY_WEIGHT_CHECKLIST,
  type DayDrawerNotes,
  type HabitStateMonthSnapshot,
  SALES_CHANNEL_KEYS,
  type SalesActivityLog,
  type SalesChecklistState,
  type WeightChecklistState,
  getMonthDateRange,
} from "@/lib/habit-state";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_KEY_REGEX, "Month must be in YYYY-MM format."),
});

const prayerChecklistSchema = z.object({
  scriptures: z.boolean(),
  prayer: z.boolean(),
  cleanRoom: z.boolean(),
  resistTemptation: z.boolean(),
  noPhoneWalk: z.boolean(),
});

const weightChecklistSchema = z.object({
  gym: z.boolean(),
  "meditate/stretch": z.boolean(),
  calories2300: z.boolean(),
  wakeUpAtSeven: z.boolean(),
  noPhoneInBathroomBedDriving: z.boolean().optional().default(false),
  fruitAndVeggies: z.boolean().optional().default(false),
  creatineAndProtein: z.boolean().optional().default(false),
});

const customDayIconSelectionSchema = z.object({
  iconKey: z.enum(CUSTOM_DAY_ICON_KEYS),
  status: z.enum(CUSTOM_DAY_ICON_STATUSES),
});

const drawerNoteSchema = z.object({
  drawerKey: z.enum(DRAWER_NOTE_KEYS),
  notes: z.string().max(20_000).nullable(),
});

const salesActivityInputSchema = z.object({
  leadName: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(120),
  channel: z.enum(SALES_CHANNEL_KEYS),
  amount: z.number().finite().min(0),
  notes: z.string().trim().max(240).optional(),
});

const mutationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setDayHabit"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    habitKey: z.enum(CALENDAR_HABIT_KEYS),
    isActive: z.boolean(),
  }),
  z.object({
    type: z.literal("setPrayerChecklist"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    checklist: prayerChecklistSchema,
  }),
  z.object({
    type: z.literal("setWeightChecklist"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    checklist: weightChecklistSchema,
  }),
  z.object({
    type: z.literal("setCustomDayIcon"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    slotIndex: z.number().int().min(0).max(2),
    selection: customDayIconSelectionSchema.nullable(),
  }),
  z.object({
    type: z.literal("setDrawerNote"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    note: drawerNoteSchema,
  }),
  z.object({
    type: z.literal("setSalesChecklist"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    checklist: z.object({
      coldEmails: z.boolean(),
      linkedinMessages: z.boolean(),
      prospectiveClients: z.boolean(),
      coldCallOrVisit: z.boolean(),
      studyCoding: z.boolean(),
      workForEY: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("addSalesActivity"),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    activity: salesActivityInputSchema,
  }),
]);

const getDatabase = () => {
  const db = getDb();

  if (!db) {
    return null;
  }

  return db;
};

const serializeSalesActivity = (
  activity: typeof salesOutreachActivities.$inferSelect,
): SalesActivityLog => ({
  id: activity.id,
  leadName: activity.leadName,
  company: activity.company,
  channel: activity.channel,
  amount: Number(activity.amount),
  notes: activity.notes,
  createdAt: activity.createdAt.toISOString(),
});

const handleError = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        issues: error.flatten(),
      },
      { status: 400 },
    );
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong.";

  return NextResponse.json({ error: message }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database is not configured." },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const { month } = monthQuerySchema.parse({
      month: url.searchParams.get("month"),
    });
    const { startDateKey, endDateKeyExclusive } = getMonthDateRange(month);

    const [dayHabits, prayerChecklists, weightChecklists, salesChecklists, customIcons, drawerNotes, salesActivities] =
      await Promise.all([
        db
          .select()
          .from(calendarDayHabits)
          .where(
            and(
              eq(calendarDayHabits.userId, user.id),
              gte(calendarDayHabits.date, startDateKey),
              lt(calendarDayHabits.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(prayerDayChecklists)
          .where(
            and(
              eq(prayerDayChecklists.userId, user.id),
              gte(prayerDayChecklists.date, startDateKey),
              lt(prayerDayChecklists.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(weightDayChecklists)
          .where(
            and(
              eq(weightDayChecklists.userId, user.id),
              gte(weightDayChecklists.date, startDateKey),
              lt(weightDayChecklists.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(salesDayChecklists)
          .where(
            and(
              eq(salesDayChecklists.userId, user.id),
              gte(salesDayChecklists.date, startDateKey),
              lt(salesDayChecklists.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(customDayIconSelections)
          .where(
            and(
              eq(customDayIconSelections.userId, user.id),
              gte(customDayIconSelections.date, startDateKey),
              lt(customDayIconSelections.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(dayDrawerNotes)
          .where(
            and(
              eq(dayDrawerNotes.userId, user.id),
              gte(dayDrawerNotes.date, startDateKey),
              lt(dayDrawerNotes.date, endDateKeyExclusive),
            ),
          ),
        db
          .select()
          .from(salesOutreachActivities)
          .where(
            and(
              eq(salesOutreachActivities.userId, user.id),
              gte(salesOutreachActivities.date, startDateKey),
              lt(salesOutreachActivities.date, endDateKeyExclusive),
            ),
          )
          .orderBy(
            desc(salesOutreachActivities.date),
            desc(salesOutreachActivities.createdAt),
          ),
      ]);

    const drawerNotesByDate = drawerNotes.reduce<Record<string, DayDrawerNotes>>(
      (grouped, note) => {
        grouped[note.date] ??= { ...EMPTY_DAY_DRAWER_NOTES };
        grouped[note.date][note.drawerKey] = note.notes || null;
        return grouped;
      },
      {},
    );

    for (const selection of customIcons) {
      if (!selection.notes) {
        continue;
      }

      drawerNotesByDate[selection.date] ??= { ...EMPTY_DAY_DRAWER_NOTES };
      drawerNotesByDate[selection.date].custom ??= selection.notes;
    }

    const snapshot: HabitStateMonthSnapshot = {
      month,
      dayHabits: dayHabits.map((habit) => ({
        dateKey: habit.date,
        habitKey: habit.habitKey,
        isActive: habit.isActive,
      })),
      prayerChecklistsByDate: Object.fromEntries(
        prayerChecklists.map((checklist) => [
          checklist.date,
          {
            scriptures: checklist.scriptures,
            prayer: checklist.prayer,
            cleanRoom: checklist.cleanRoom,
            resistTemptation: checklist.resistTemptation,
            noPhoneWalk: checklist.noPhoneWalk,
          },
        ]),
      ),
      weightChecklistsByDate: Object.fromEntries(
        weightChecklists.map((checklist) => [
          checklist.date,
          {
            gym: checklist.gym,
            "meditate/stretch": checklist.meditateStretch,
            calories2300: checklist.calories2300,
            wakeUpAtSeven: checklist.wakeUpAtSeven,
            noPhoneInBathroomBedDriving: checklist.noPhoneInBathroomBedDriving ?? false,
            fruitAndVeggies: checklist.fruitAndVeggies ?? false,
            creatineAndProtein: checklist.creatineAndProtein ?? false,
          } satisfies WeightChecklistState,
        ]),
      ),
      salesChecklistsByDate: Object.fromEntries(
        salesChecklists.map((checklist) => [
          checklist.date,
          {
            coldEmails: checklist.coldEmails,
            linkedinMessages: checklist.linkedinMessages,
            prospectiveClients: checklist.prospectiveClients,
            coldCallOrVisit: checklist.coldCallOrVisit,
            studyCoding: checklist.studyCoding,
            workForEY: checklist.workForEY,
          } satisfies SalesChecklistState,
        ]),
      ),
      drawerNotesByDate,
      customDayIconsByDate: Object.fromEntries(
        customIcons.map((selection) => [
          `${selection.date}_${selection.slotIndex}`,
          {
            iconKey: selection.iconKey,
            status: selection.status,
          },
        ]),
      ),
      salesByDate: salesActivities.reduce<Record<string, SalesActivityLog[]>>(
        (grouped, activity) => {
          const dateKey = activity.date;
          const nextActivity = serializeSalesActivity(activity);

          grouped[dateKey] = [...(grouped[dateKey] ?? []), nextActivity];
          return grouped;
        },
        {},
      ),
    };

    for (const dateKey of Object.keys(snapshot.prayerChecklistsByDate)) {
      snapshot.prayerChecklistsByDate[dateKey] ??= EMPTY_PRAYER_CHECKLIST;
    }

    for (const dateKey of Object.keys(snapshot.weightChecklistsByDate)) {
      snapshot.weightChecklistsByDate[dateKey] ??= EMPTY_WEIGHT_CHECKLIST;
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database is not configured." },
        { status: 503 },
      );
    }

    const input = mutationSchema.parse(await request.json());

    switch (input.type) {
      case "setDayHabit": {
        await db
          .insert(calendarDayHabits)
          .values({
            userId: user.id,
            date: input.dateKey,
            habitKey: input.habitKey,
            isActive: input.isActive,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              calendarDayHabits.userId,
              calendarDayHabits.date,
              calendarDayHabits.habitKey,
            ],
            set: {
              isActive: input.isActive,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "setPrayerChecklist": {
        await db
          .insert(prayerDayChecklists)
          .values({
            userId: user.id,
            date: input.dateKey,
            ...input.checklist,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [prayerDayChecklists.userId, prayerDayChecklists.date],
            set: {
              ...input.checklist,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "setWeightChecklist": {
        const checklistValues = {
          gym: input.checklist.gym,
          meditateStretch: input.checklist["meditate/stretch"],
          calories2300: input.checklist.calories2300,
          wakeUpAtSeven: input.checklist.wakeUpAtSeven,
          noPhoneInBathroomBedDriving: input.checklist.noPhoneInBathroomBedDriving,
          fruitAndVeggies: input.checklist.fruitAndVeggies,
          creatineAndProtein: input.checklist.creatineAndProtein,
        };
        await db
          .insert(weightDayChecklists)
          .values({
            userId: user.id,
            date: input.dateKey,
            ...checklistValues,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [weightDayChecklists.userId, weightDayChecklists.date],
            set: {
              ...checklistValues,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "setCustomDayIcon": {
        if (!input.selection) {
          await db
            .delete(customDayIconSelections)
            .where(
              and(
                eq(customDayIconSelections.userId, user.id),
                eq(customDayIconSelections.date, input.dateKey),
                eq(customDayIconSelections.slotIndex, input.slotIndex),
              ),
            );

          return NextResponse.json({ ok: true });
        }

        await db
          .insert(customDayIconSelections)
          .values({
            userId: user.id,
            date: input.dateKey,
            slotIndex: input.slotIndex,
            iconKey: input.selection.iconKey,
            status: input.selection.status,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              customDayIconSelections.userId,
              customDayIconSelections.date,
              customDayIconSelections.slotIndex,
            ],
            set: {
              iconKey: input.selection.iconKey,
              status: input.selection.status,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "setDrawerNote": {
        if (!input.note.notes?.trim()) {
          await db.delete(dayDrawerNotes).where(
            and(
              eq(dayDrawerNotes.userId, user.id),
              eq(dayDrawerNotes.date, input.dateKey),
              eq(dayDrawerNotes.drawerKey, input.note.drawerKey),
            ),
          );

          return NextResponse.json({ ok: true });
        }

        await db
          .insert(dayDrawerNotes)
          .values({
            userId: user.id,
            date: input.dateKey,
            drawerKey: input.note.drawerKey,
            notes: input.note.notes,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              dayDrawerNotes.userId,
              dayDrawerNotes.date,
              dayDrawerNotes.drawerKey,
            ],
            set: {
              notes: input.note.notes,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "setSalesChecklist": {
        await db
          .insert(salesDayChecklists)
          .values({
            userId: user.id,
            date: input.dateKey,
            coldEmails: input.checklist.coldEmails,
            linkedinMessages: input.checklist.linkedinMessages,
            prospectiveClients: input.checklist.prospectiveClients,
            coldCallOrVisit: input.checklist.coldCallOrVisit,
            studyCoding: input.checklist.studyCoding,
            workForEY: input.checklist.workForEY,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [salesDayChecklists.userId, salesDayChecklists.date],
            set: {
              coldEmails: input.checklist.coldEmails,
              linkedinMessages: input.checklist.linkedinMessages,
              prospectiveClients: input.checklist.prospectiveClients,
              coldCallOrVisit: input.checklist.coldCallOrVisit,
              studyCoding: input.checklist.studyCoding,
              workForEY: input.checklist.workForEY,
              updatedAt: new Date(),
            },
          });

        return NextResponse.json({ ok: true });
      }

      case "addSalesActivity": {
        const [savedActivity] = await db
          .insert(salesOutreachActivities)
          .values({
            userId: user.id,
            date: input.dateKey,
            leadName: input.activity.leadName,
            company: input.activity.company,
            channel: input.activity.channel,
            amount: input.activity.amount,
            notes: input.activity.notes?.trim() ?? "",
          })
          .returning();

        return NextResponse.json({
          activity: serializeSalesActivity(savedActivity),
        });
      }
    }
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return handleError(error);
  }
}
