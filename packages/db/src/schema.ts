import {
    boolean,
    date,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

export const CALENDAR_HABIT_KEYS = ["prayer", "gym", "outreach"] as const;
export const SALES_CHANNEL_KEYS = ["call", "email", "dm", "meeting"] as const;
export const DRAWER_NOTE_KEYS = [
    "prayer",
    "gym",
    "outreach",
    "custom",
    "custom_0",
    "custom_1",
    "custom_2",
] as const;
export const CUSTOM_DAY_ICON_KEYS = [
    "tent",
    "heart",
    "party",
    "lunch",
    "phone",
    "financialPlanning",
    "firstAid",
    "temple",
    "book",
    "walk",
    "group",
    "climb",
    "tennis",
    "cook",
    "piano",
    "ministering",
    "czechCall",
] as const;
export const CUSTOM_DAY_ICON_STATUSES = ["planned", "complete"] as const;

export const calendarHabitKeyEnum = pgEnum(
    "calendar_habit_key",
    CALENDAR_HABIT_KEYS,
);
export const salesChannelEnum = pgEnum("sales_channel", SALES_CHANNEL_KEYS);
export const drawerNoteKeyEnum = pgEnum("drawer_note_key", DRAWER_NOTE_KEYS);
export const customDayIconKeyEnum = pgEnum(
    "custom_day_icon_key",
    CUSTOM_DAY_ICON_KEYS,
);
export const customDayIconStatusEnum = pgEnum(
    "custom_day_icon_status",
    CUSTOM_DAY_ICON_STATUSES,
);

export const habits = pgTable("habits", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

export const calendarDayHabits = pgTable(
    "calendar_day_habits",
    {
        date: date("date", { mode: "string" }).notNull(),
        habitKey: calendarHabitKeyEnum("habit_key").notNull(),
        isActive: boolean("is_active").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        primaryKey({
            name: "calendar_day_habits_date_habit_key_pk",
            columns: [table.date, table.habitKey],
        }),
        index("calendar_day_habits_date_idx").on(table.date),
    ],
);

export const prayerDayChecklists = pgTable(
    "prayer_day_checklists",
    {
        date: date("date", { mode: "string" }).primaryKey(),
        scriptures: boolean("scriptures").default(false).notNull(),
        prayer: boolean("prayer").default(false).notNull(),
        cleanRoom: boolean("clean_room").default(false).notNull(),
        resistTemptation: boolean("resist_temptation").default(false).notNull(),
        noPhoneWalk: boolean("no_phone_walk").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [index("prayer_day_checklists_date_idx").on(table.date)],
);

export const weightDayChecklists = pgTable(
    "weight_day_checklists",
    {
        date: date("date", { mode: "string" }).primaryKey(),
        gym: boolean("gym").default(false).notNull(),
        meditateStretch: boolean("meditate_stretch").default(false).notNull(),
        calories2300: boolean("calories_2300").default(false).notNull(),
        wakeUpAtSeven: boolean("wake_up_at_seven").default(false).notNull(),
        noPhoneInBathroomBedDriving: boolean("no_phone_in_bathroom_bed_driving").default(false).notNull(),
        fruitAndVeggies: boolean("fruit_and_veggies").default(false).notNull(),
        creatineAndProtein: boolean("creatine_and_protein").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [index("weight_day_checklists_date_idx").on(table.date)],
);

export const customDayIconSelections = pgTable(
    "custom_day_icon_selections",
    {
        date: date("date", { mode: "string" }).notNull(),
        slotIndex: integer("slot_index").notNull().default(0),
        iconKey: customDayIconKeyEnum("icon_key").notNull(),
        status: customDayIconStatusEnum("status").notNull(),
        notes: text("notes").default("").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        primaryKey({
            name: "custom_day_icon_selections_date_slot_pk",
            columns: [table.date, table.slotIndex],
        }),
        index("custom_day_icon_selections_date_idx").on(table.date),
    ],
);

export const dayDrawerNotes = pgTable(
    "day_drawer_notes",
    {
        date: date("date", { mode: "string" }).notNull(),
        drawerKey: drawerNoteKeyEnum("drawer_key").notNull(),
        notes: text("notes").default("").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        primaryKey({
            name: "day_drawer_notes_date_drawer_key_pk",
            columns: [table.date, table.drawerKey],
        }),
        index("day_drawer_notes_date_idx").on(table.date),
    ],
);

export const salesDayChecklists = pgTable(
    "sales_day_checklists",
    {
        date: date("date", { mode: "string" }).primaryKey(),
        coldEmails: boolean("cold_emails").default(false).notNull(),
        linkedinMessages: boolean("linkedin_messages").default(false).notNull(),
        prospectiveClients: boolean("prospective_clients").default(false).notNull(),
        coldCallOrVisit: boolean("cold_call_or_visit").default(false).notNull(),
        studyCoding: boolean("study_coding").default(false).notNull(),
        workForEY: boolean("work_for_ey").default(false).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [index("sales_day_checklists_date_idx").on(table.date)],
);

export const goalPreferences = pgTable("goal_preferences", {
    goalKey: text("goal_key").primaryKey(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

export const salesOutreachActivities = pgTable(
    "sales_outreach_activities",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        date: date("date", { mode: "string" }).notNull(),
        leadName: text("lead_name").notNull(),
        company: text("company").notNull(),
        channel: salesChannelEnum("channel").notNull(),
        amount: numeric("amount", {
            precision: 12,
            scale: 2,
            mode: "number",
        }).notNull(),
        notes: text("notes").default("").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [index("sales_outreach_activities_date_idx").on(table.date)],
);

export const contacts = pgTable(
    "contacts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: text("name").notNull(),
        company: text("company").default("").notNull(),
        phone: text("phone").default("").notNull(),
        email: text("email").default("").notNull(),
        category: text("category").default("").notNull(),
        team: text("team").default("").notNull(),
        status: text("status").default("").notNull(),
        priority: text("priority").default("").notNull(),
        lastResponse: date("last_response", { mode: "string" }),
        lastContacted: date("last_contacted", { mode: "string" }),
        notes: text("notes").default("").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index("contacts_name_idx").on(table.name),
        index("contacts_category_idx").on(table.category),
    ],
);

export type CalendarHabitKey = (typeof CALENDAR_HABIT_KEYS)[number];
export type SalesChannelKey = (typeof SALES_CHANNEL_KEYS)[number];
export type DrawerNoteKey = (typeof DRAWER_NOTE_KEYS)[number];
export type CustomDayIconKey = (typeof CUSTOM_DAY_ICON_KEYS)[number];
export type CustomDayIconStatus = (typeof CUSTOM_DAY_ICON_STATUSES)[number];

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type CalendarDayHabit = typeof calendarDayHabits.$inferSelect;
export type NewCalendarDayHabit = typeof calendarDayHabits.$inferInsert;
export type PrayerDayChecklist = typeof prayerDayChecklists.$inferSelect;
export type NewPrayerDayChecklist = typeof prayerDayChecklists.$inferInsert;
export type WeightDayChecklist = typeof weightDayChecklists.$inferSelect;
export type NewWeightDayChecklist = typeof weightDayChecklists.$inferInsert;
export type CustomDayIconSelection = typeof customDayIconSelections.$inferSelect;
export type NewCustomDayIconSelection = typeof customDayIconSelections.$inferInsert;
export type DayDrawerNote = typeof dayDrawerNotes.$inferSelect;
export type NewDayDrawerNote = typeof dayDrawerNotes.$inferInsert;
export type SalesDayChecklist = typeof salesDayChecklists.$inferSelect;
export type NewSalesDayChecklist = typeof salesDayChecklists.$inferInsert;
export type SalesOutreachActivity = typeof salesOutreachActivities.$inferSelect;
export type NewSalesOutreachActivity =
    typeof salesOutreachActivities.$inferInsert;
export const GOAL_PERIODS = ["daily", "weekly", "monthly"] as const;
export const GOAL_PRIORITIES = ["high", "medium", "low"] as const;
export const LOG_STATUSES = ["complete", "incomplete"] as const;

export const goalPeriodEnum = pgEnum("goal_period", GOAL_PERIODS);
export const goalPriorityEnum = pgEnum("goal_priority", GOAL_PRIORITIES);
export const logStatusEnum = pgEnum("log_status", LOG_STATUSES);

export const categories = pgTable("categories", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

export const goals = pgTable(
    "goals",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: text("name").notNull(),
        frequencyGoal: integer("frequency_goal"),
        period: goalPeriodEnum("period"),
        categoryId: uuid("category_id")
            .notNull()
            .references(() => categories.id),
        priority: goalPriorityEnum("priority").notNull(),
        iconKey: text("icon_key").default("").notNull(),
        hidden: boolean("hidden").default(false).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index("goals_category_id_idx").on(table.categoryId),
        index("goals_priority_idx").on(table.priority),
    ],
);

export const goalLogs = pgTable(
    "goal_logs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        goalId: uuid("goal_id")
            .notNull()
            .references(() => goals.id, { onDelete: "cascade" }),
        date: date("date", { mode: "string" }).notNull(),
        status: logStatusEnum("status").notNull(),
        notes: text("notes").default("").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        unique("goal_logs_goal_id_date_uidx").on(table.goalId, table.date),
        index("goal_logs_date_idx").on(table.date),
    ],
);

export type GoalPreference = typeof goalPreferences.$inferSelect;
export type NewGoalPreference = typeof goalPreferences.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalLog = typeof goalLogs.$inferSelect;
export type NewGoalLog = typeof goalLogs.$inferInsert;
