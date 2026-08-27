import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const GOAL_PERIODS = ["daily", "weekly", "monthly"] as const;
export const GOAL_PRIORITIES = ["high", "low"] as const;
export const GOAL_VISIBILITIES = [
  "only_me",
  "goal_friends",
  "all_friends",
] as const;
export const LOG_STATUSES = ["complete", "incomplete", "planned"] as const;
export const PLANNED_EVENT_SOURCE_TYPES = [
  "task",
  "goal_checkpoint",
  "habit_instance",
  "other_event",
] as const;
export const FRIEND_STATUSES = ["requested", "accepted", "archived"] as const;
export const FRIEND_MESSAGE_TYPES = ["message", "incentive"] as const;
export const FRIEND_GOAL_SCOPES = ["all", "shared", "single", "high"] as const;
export const FRIEND_GOAL_TARGET_TYPES = ["habit", "goal"] as const;
export const SHARED_GOAL_MODES = ["collaborative", "competitive"] as const;
export const SHARED_GOAL_SCORING_TYPES = [
  "shared_streak",
  "combined_target",
  "first_to_target",
  "highest_total",
  "longest_streak",
  "one_time",
] as const;
export const SHARED_GOAL_STATUSES = [
  "active",
  "completed",
  "archived",
] as const;
export const SHARED_GOAL_STAKE_TYPES = ["none", "carrot", "stick"] as const;
export const SHARED_GOAL_PARTICIPANT_STATUSES = [
  "invited",
  "accepted",
  "declined",
  "left",
] as const;
export const MODERATION_REPORT_TARGET_TYPES = [
  "feed_post",
  "feed_comment",
  "user",
  "ad",
  "general",
] as const;
export const MODERATION_REPORT_STATUSES = [
  "open",
  "reviewed",
  "dismissed",
  "actioned",
] as const;
export const MENTION_SOURCE_TYPES = [
  "goal_log",
  "goal_checkpoint",
  "reflection_post",
  "feed_comment",
  "reflection_comment",
] as const;
export const FEED_REPOST_SOURCE_TYPES = [
  "goal_log",
  "goal_checkpoint",
  "reflection_post",
  "social_feed_post",
] as const;

export const goalPeriodEnum = pgEnum("goal_period", GOAL_PERIODS);
export const goalPriorityEnum = pgEnum("goal_priority", GOAL_PRIORITIES);
export const goalVisibilityEnum = pgEnum("goal_visibility", GOAL_VISIBILITIES);
export const logStatusEnum = pgEnum("log_status", LOG_STATUSES);
export const friendStatusEnum = pgEnum("friend_status", FRIEND_STATUSES);
export const friendMessageTypeEnum = pgEnum(
  "friend_message_type",
  FRIEND_MESSAGE_TYPES,
);
export const friendGoalScopeEnum = pgEnum(
  "friend_goal_scope",
  FRIEND_GOAL_SCOPES,
);
export const friendGoalTargetTypeEnum = pgEnum(
  "friend_goal_target_type",
  FRIEND_GOAL_TARGET_TYPES,
);
export const sharedGoalModeEnum = pgEnum("shared_goal_mode", SHARED_GOAL_MODES);
export const sharedGoalScoringTypeEnum = pgEnum(
  "shared_goal_scoring_type",
  SHARED_GOAL_SCORING_TYPES,
);
export const sharedGoalStatusEnum = pgEnum(
  "shared_goal_status",
  SHARED_GOAL_STATUSES,
);
export const sharedGoalStakeTypeEnum = pgEnum(
  "shared_goal_stake_type",
  SHARED_GOAL_STAKE_TYPES,
);
export const sharedGoalParticipantStatusEnum = pgEnum(
  "shared_goal_participant_status",
  SHARED_GOAL_PARTICIPANT_STATUSES,
);
export const moderationReportTargetTypeEnum = pgEnum(
  "moderation_report_target_type",
  MODERATION_REPORT_TARGET_TYPES,
);
export const moderationReportStatusEnum = pgEnum(
  "moderation_report_status",
  MODERATION_REPORT_STATUSES,
);
export const mentionSourceTypeEnum = pgEnum(
  "mention_source_type",
  MENTION_SOURCE_TYPES,
);

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    firstName: text("first_name").default("").notNull(),
    lastName: text("last_name").default("").notNull(),
    email: text("email").notNull(),
    phoneNumber: text("phone_number"),
    birthday: date("birthday", { mode: "string" }),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("user_email_unique").on(table.email),
    index("user_last_opened_at_idx").on(table.lastOpenedAt),
    index("user_deleted_at_idx").on(table.deletedAt),
  ],
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    unique("verification_identifier_value_unique").on(
      table.identifier,
      table.value,
    ),
  ],
);

export const contactCategories = pgTable("contact_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contactStatuses = pgTable("contact_statuses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    organization: text("organization").default("").notNull(),
    phone: text("phone").default("").notNull(),
    email: text("email").default("").notNull(),
    contactCategoryId: uuid("contact_category_id").references(
      () => contactCategories.id,
      { onDelete: "set null" },
    ),
    contactStatusId: uuid("contact_status_id").references(
      () => contactStatuses.id,
      { onDelete: "set null" },
    ),
    priority: text("priority").default("").notNull(),
    nextContactDate: date("next_contact_date", { mode: "string" }),
    lastContactAttempt: date("last_contact_attempt", { mode: "string" })
      .default(sql`CURRENT_DATE`)
      .notNull(),
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
    index("contacts_user_id_idx").on(table.userId),
    index("contacts_name_idx").on(table.name),
    index("contacts_contact_category_id_idx").on(table.contactCategoryId),
    index("contacts_contact_status_id_idx").on(table.contactStatusId),
  ],
);

export const friends = pgTable(
  "friends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId1: text("user_id_1")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId2: text("user_id_2")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendStatusEnum("status").default("requested").notNull(),
  },
  (table) => [
    index("friends_user_id_1_idx").on(table.userId1),
    index("friends_user_id_2_idx").on(table.userId2),
    index("friends_status_idx").on(table.status),
    unique("friends_user_id_1_user_id_2_uidx").on(table.userId1, table.userId2),
  ],
);

export const friendGroups = pgTable(
  "friend_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("friend_groups_owner_id_idx").on(table.ownerId),
    unique("friend_groups_owner_id_name_uidx").on(table.ownerId, table.name),
  ],
);

export const friendGroupMembers = pgTable(
  "friend_group_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => friendGroups.id, { onDelete: "cascade" }),
    memberUserId: text("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("friend_group_members_group_id_idx").on(table.groupId),
    index("friend_group_members_member_user_id_idx").on(table.memberUserId),
    unique("friend_group_members_group_id_member_user_id_uidx").on(
      table.groupId,
      table.memberUserId,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    unique("projects_user_id_name_uidx").on(table.userId, table.name),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    importance: text("importance").default("").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    completedAt: date("completed_at", { mode: "string" }),
    timeRequired: text("time_required").default("").notNull(),
    recurrence: text("recurrence").default("none").notNull(),
    recurrenceWeekday: integer("recurrence_weekday"),
    recurrenceMonthDay: integer("recurrence_month_day"),
    recurrenceWeekdays: integer("recurrence_weekdays").array(),
    recurrenceMonthDays: integer("recurrence_month_days").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_project_id_idx").on(table.projectId),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_completed_at_idx").on(table.completedAt),
    index("tasks_created_at_idx").on(table.createdAt),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("categories_user_id_idx").on(table.userId),
    unique("categories_user_id_name_uidx").on(table.userId, table.name),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    timing: text("timing").default("current").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("goals_user_id_idx").on(table.userId),
    index("goals_user_sort_order_idx").on(table.userId, table.sortOrder),
    index("goals_created_at_idx").on(table.createdAt),
  ],
);

export const goalCheckpoints = pgTable(
  "goal_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetDate: date("target_date", { mode: "string" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    visibility: goalVisibilityEnum("visibility").default("only_me").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("goal_checkpoints_goal_id_idx").on(table.goalId),
    index("goal_checkpoints_user_id_idx").on(table.userId),
    index("goal_checkpoints_target_date_idx").on(table.targetDate),
  ],
);

export const plannedEvents = pgTable(
  "planned_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceParentId: uuid("source_parent_id"),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    plannedStartTime: text("planned_start_time"),
    plannedEndTime: text("planned_end_time"),
    googleCalendarEventId: text("google_calendar_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("planned_events_user_source_uidx").on(
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
    index("planned_events_user_id_idx").on(table.userId),
    index("planned_events_date_idx").on(table.date),
    index("planned_events_source_idx").on(table.sourceType, table.sourceId),
    index("planned_events_source_parent_idx").on(
      table.sourceType,
      table.sourceParentId,
    ),
  ],
);

export const weeklyPlanNotes = pgTable(
  "weekly_plan_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
    notes: text("notes").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("weekly_plan_notes_user_week_start_uidx").on(
      table.userId,
      table.weekStartDate,
    ),
    index("weekly_plan_notes_user_id_idx").on(table.userId),
  ],
);

export const weeklyPlanNoteHeaders = pgTable(
  "weekly_plan_note_headers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("weekly_plan_note_headers_user_text_uidx").on(
      table.userId,
      table.text,
    ),
    index("weekly_plan_note_headers_user_id_idx").on(table.userId),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    frequencyGoal: integer("frequency_goal"),
    period: goalPeriodEnum("period").default("daily").notNull(),
    repeatCadence: goalPeriodEnum("repeat_cadence"),
    repeatInterval: integer("repeat_interval"),
    repeatDays: json("repeat_days").$type<number[]>(),
    repeatMonthlyType: text("repeat_monthly_type"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    goalId: uuid("goal_id").references(() => goals.id, {
      onDelete: "set null",
    }),
    priority: goalPriorityEnum("priority").notNull(),
    visibility: goalVisibilityEnum("visibility").default("only_me").notNull(),
    iconKey: text("icon_key").default("").notNull(),
    defaultComplete: boolean("default_complete").default(false).notNull(),
    requireEvidence: boolean("require_evidence").default(false).notNull(),
    planOnCalendar: boolean("plan_on_calendar").default(true).notNull(),
    reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
    reminderTime: text("reminder_time"),
    reminderTimes: text("reminder_times").array(),
    hidden: boolean("hidden").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("habits_user_id_idx").on(table.userId),
    index("habits_category_id_idx").on(table.categoryId),
    index("habits_goal_id_idx").on(table.goalId),
    index("habits_priority_idx").on(table.priority),
    unique("habits_user_category_name_uidx").on(
      table.userId,
      table.categoryId,
      table.name,
    ),
  ],
);

export const habitAudienceFriends = pgTable(
  "habit_audience_friends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendUserId: text("friend_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("habit_audience_friends_habit_id_idx").on(table.habitId),
    index("habit_audience_friends_user_id_idx").on(table.userId),
    index("habit_audience_friends_friend_user_id_idx").on(table.friendUserId),
    unique("habit_audience_friends_habit_friend_uidx").on(
      table.habitId,
      table.friendUserId,
    ),
  ],
);

export const habitAudienceGroups = pgTable(
  "habit_audience_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => friendGroups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("habit_audience_groups_habit_id_idx").on(table.habitId),
    index("habit_audience_groups_user_id_idx").on(table.userId),
    index("habit_audience_groups_group_id_idx").on(table.groupId),
    unique("habit_audience_groups_habit_group_uidx").on(
      table.habitId,
      table.groupId,
    ),
  ],
);

export const goalLogs = pgTable(
  "goal_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    status: logStatusEnum("status").notNull(),
    completedCount: integer("completed_count").default(0).notNull(),
    notes: text("notes").default("").notNull(),
    plannedStartTime: text("planned_start_time"),
    plannedEndTime: text("planned_end_time"),
    plannedRepeatsDaily: boolean("planned_repeats_daily")
      .default(false)
      .notNull(),
    googleCalendarEventId: text("google_calendar_event_id"),
    visibility: goalVisibilityEnum("visibility").default("only_me").notNull(),
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
    index("goal_logs_user_id_idx").on(table.userId),
  ],
);

export const goalLogPhotos = pgTable(
  "goal_log_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalLogId: uuid("goal_log_id")
      .notNull()
      .references(() => goalLogs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("goal_log_photos_goal_log_id_idx").on(table.goalLogId),
    index("goal_log_photos_user_id_idx").on(table.userId),
    unique("goal_log_photos_storage_path_uidx").on(table.storagePath),
  ],
);

export const goalCheckpointPhotos = pgTable(
  "goal_checkpoint_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkpointId: uuid("checkpoint_id")
      .notNull()
      .references(() => goalCheckpoints.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("goal_checkpoint_photos_checkpoint_id_idx").on(table.checkpointId),
    index("goal_checkpoint_photos_user_id_idx").on(table.userId),
    unique("goal_checkpoint_photos_storage_path_uidx").on(table.storagePath),
  ],
);

export const feedProps = pgTable(
  "feed_props",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalLogId: uuid("goal_log_id")
      .notNull()
      .references(() => goalLogs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("feed_props_goal_log_id_user_id_uidx").on(
      table.goalLogId,
      table.userId,
    ),
    index("feed_props_goal_log_id_idx").on(table.goalLogId),
    index("feed_props_user_id_idx").on(table.userId),
  ],
);

export const feedComments = pgTable(
  "feed_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalLogId: uuid("goal_log_id")
      .notNull()
      .references(() => goalLogs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => feedComments.id,
      { onDelete: "cascade" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("feed_comments_goal_log_id_idx").on(table.goalLogId),
    index("feed_comments_parent_comment_id_idx").on(table.parentCommentId),
    index("feed_comments_user_id_idx").on(table.userId),
  ],
);

export const dailyReflectionPosts = pgTable(
  "daily_reflection_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    body: text("body").notNull(),
    visibility: goalVisibilityEnum("visibility")
      .default("all_friends")
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reflection_posts_user_id_idx").on(table.userId),
    index("daily_reflection_posts_date_idx").on(table.date),
    index("daily_reflection_posts_updated_at_idx").on(table.updatedAt),
  ],
);

export const dailyReflectionProps = pgTable(
  "daily_reflection_props",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reflectionPostId: uuid("reflection_post_id")
      .notNull()
      .references(() => dailyReflectionPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("daily_reflection_props_post_user_uidx").on(
      table.reflectionPostId,
      table.userId,
    ),
    index("daily_reflection_props_post_id_idx").on(table.reflectionPostId),
    index("daily_reflection_props_user_id_idx").on(table.userId),
  ],
);

export const dailyReflectionPhotos = pgTable(
  "daily_reflection_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reflectionPostId: uuid("reflection_post_id")
      .notNull()
      .references(() => dailyReflectionPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reflection_photos_post_id_idx").on(table.reflectionPostId),
    index("daily_reflection_photos_user_id_idx").on(table.userId),
    unique("daily_reflection_photos_storage_path_uidx").on(table.storagePath),
  ],
);

export const dailyReflectionAudienceFriends = pgTable(
  "daily_reflection_audience_friends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reflectionPostId: uuid("reflection_post_id")
      .notNull()
      .references(() => dailyReflectionPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendUserId: text("friend_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reflection_audience_friends_post_id_idx").on(
      table.reflectionPostId,
    ),
    index("daily_reflection_audience_friends_user_id_idx").on(table.userId),
    index("daily_reflection_audience_friends_friend_user_id_idx").on(
      table.friendUserId,
    ),
    unique("daily_reflection_audience_friends_post_friend_uidx").on(
      table.reflectionPostId,
      table.friendUserId,
    ),
  ],
);

export const dailyReflectionAudienceGroups = pgTable(
  "daily_reflection_audience_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reflectionPostId: uuid("reflection_post_id")
      .notNull()
      .references(() => dailyReflectionPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => friendGroups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reflection_audience_groups_post_id_idx").on(
      table.reflectionPostId,
    ),
    index("daily_reflection_audience_groups_user_id_idx").on(table.userId),
    index("daily_reflection_audience_groups_group_id_idx").on(table.groupId),
    unique("daily_reflection_audience_groups_post_group_uidx").on(
      table.reflectionPostId,
      table.groupId,
    ),
  ],
);

export const dailyReflectionComments = pgTable(
  "daily_reflection_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reflectionPostId: uuid("reflection_post_id")
      .notNull()
      .references(() => dailyReflectionPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => dailyReflectionComments.id,
      { onDelete: "cascade" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reflection_comments_post_id_idx").on(table.reflectionPostId),
    index("daily_reflection_comments_parent_comment_id_idx").on(
      table.parentCommentId,
    ),
    index("daily_reflection_comments_user_id_idx").on(table.userId),
  ],
);

export const socialFeedPosts = pgTable(
  "social_feed_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    title: text("title").notNull(),
    body: text("body").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("social_feed_posts_source_uidx").on(
      table.sourceType,
      table.sourceId,
      table.kind,
    ),
    index("social_feed_posts_user_id_idx").on(table.userId),
    index("social_feed_posts_target_user_id_idx").on(table.targetUserId),
    index("social_feed_posts_created_at_idx").on(table.createdAt),
  ],
);

export const socialFeedPostProps = pgTable(
  "social_feed_post_props",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    socialFeedPostId: uuid("social_feed_post_id")
      .notNull()
      .references(() => socialFeedPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("social_feed_post_props_post_user_uidx").on(
      table.socialFeedPostId,
      table.userId,
    ),
    index("social_feed_post_props_post_id_idx").on(table.socialFeedPostId),
    index("social_feed_post_props_user_id_idx").on(table.userId),
  ],
);

export const socialFeedPostComments = pgTable(
  "social_feed_post_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    socialFeedPostId: uuid("social_feed_post_id")
      .notNull()
      .references(() => socialFeedPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => socialFeedPostComments.id,
      { onDelete: "cascade" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("social_feed_post_comments_post_id_idx").on(table.socialFeedPostId),
    index("social_feed_post_comments_parent_comment_id_idx").on(
      table.parentCommentId,
    ),
    index("social_feed_post_comments_user_id_idx").on(table.userId),
  ],
);

export const feedReposts = pgTable(
  "feed_reposts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("feed_reposts_user_source_uidx").on(
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
    index("feed_reposts_source_idx").on(table.sourceType, table.sourceId),
    index("feed_reposts_user_id_idx").on(table.userId),
    index("feed_reposts_created_at_idx").on(table.createdAt),
  ],
);

export const contentMentions = pgTable(
  "content_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: mentionSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mentionedUserId: text("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("content_mentions_source_user_uidx").on(
      table.sourceType,
      table.sourceId,
      table.mentionedUserId,
    ),
    index("content_mentions_source_idx").on(table.sourceType, table.sourceId),
    index("content_mentions_mentioned_user_id_idx").on(table.mentionedUserId),
  ],
);

export const moderationReports = pgTable(
  "moderation_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: moderationReportTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id"),
    reason: text("reason").notNull(),
    context: json("context").$type<Record<string, unknown>>().default({}),
    status: moderationReportStatusEnum("status").notNull().default("open"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("moderation_reports_reporter_id_idx").on(table.reporterId),
    index("moderation_reports_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
    index("moderation_reports_target_idx").on(table.targetType, table.targetId),
  ],
);

export const sharedGoals = pgTable(
  "shared_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: sharedGoalModeEnum("mode").notNull(),
    scoringType: sharedGoalScoringTypeEnum("scoring_type").notNull(),
    target: integer("target"),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    openInvite: boolean("open_invite").default(false).notNull(),
    status: sharedGoalStatusEnum("status").default("active").notNull(),
    stakeType: sharedGoalStakeTypeEnum("stake_type").default("none").notNull(),
    stakeDescription: text("stake_description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("shared_goals_owner_id_idx").on(table.ownerId),
    index("shared_goals_status_idx").on(table.status),
  ],
);

export const sharedGoalParticipants = pgTable(
  "shared_goal_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sharedGoalId: uuid("shared_goal_id")
      .notNull()
      .references(() => sharedGoals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personalGoalId: uuid("personal_goal_id").references(() => habits.id, {
      onDelete: "set null",
    }),
    personalPlanGoalId: uuid("personal_plan_goal_id").references(
      () => goals.id,
      { onDelete: "set null" },
    ),
    personalGoalAutoCreated: boolean("personal_goal_auto_created")
      .default(false)
      .notNull(),
    status: sharedGoalParticipantStatusEnum("status")
      .default("invited")
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("shared_goal_participants_shared_goal_id_user_id_uidx").on(
      table.sharedGoalId,
      table.userId,
    ),
    index("shared_goal_participants_shared_goal_id_idx").on(table.sharedGoalId),
    index("shared_goal_participants_user_id_idx").on(table.userId),
    index("shared_goal_participants_personal_goal_id_idx").on(
      table.personalGoalId,
    ),
    index("shared_goal_participants_personal_plan_goal_id_idx").on(
      table.personalPlanGoalId,
    ),
    index("shared_goal_participants_status_idx").on(table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type ContactCategory = typeof contactCategories.$inferSelect;
export type NewContactCategory = typeof contactCategories.$inferInsert;
export type ContactStatus = typeof contactStatuses.$inferSelect;
export type NewContactStatus = typeof contactStatuses.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Friend = typeof friends.$inferSelect;
export type NewFriend = typeof friends.$inferInsert;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];
export type FriendGroup = typeof friendGroups.$inferSelect;
export type NewFriendGroup = typeof friendGroups.$inferInsert;
export type FriendGroupMember = typeof friendGroupMembers.$inferSelect;
export type NewFriendGroupMember = typeof friendGroupMembers.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type PlannedEventSourceType =
  (typeof PLANNED_EVENT_SOURCE_TYPES)[number];
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type GoalVisibility = (typeof GOAL_VISIBILITIES)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalCheckpoint = typeof goalCheckpoints.$inferSelect;
export type NewGoalCheckpoint = typeof goalCheckpoints.$inferInsert;
export type PlannedEvent = typeof plannedEvents.$inferSelect;
export type NewPlannedEvent = typeof plannedEvents.$inferInsert;
export type WeeklyPlanNote = typeof weeklyPlanNotes.$inferSelect;
export type NewWeeklyPlanNote = typeof weeklyPlanNotes.$inferInsert;
export type WeeklyPlanNoteHeader = typeof weeklyPlanNoteHeaders.$inferSelect;
export type NewWeeklyPlanNoteHeader = typeof weeklyPlanNoteHeaders.$inferInsert;
export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type GoalLog = typeof goalLogs.$inferSelect;
export type NewGoalLog = typeof goalLogs.$inferInsert;
export type GoalLogPhoto = typeof goalLogPhotos.$inferSelect;
export type NewGoalLogPhoto = typeof goalLogPhotos.$inferInsert;
export type GoalCheckpointPhoto = typeof goalCheckpointPhotos.$inferSelect;
export type NewGoalCheckpointPhoto = typeof goalCheckpointPhotos.$inferInsert;
export type FeedProp = typeof feedProps.$inferSelect;
export type NewFeedProp = typeof feedProps.$inferInsert;
export type FeedComment = typeof feedComments.$inferSelect;
export type NewFeedComment = typeof feedComments.$inferInsert;
export type SocialFeedPost = typeof socialFeedPosts.$inferSelect;
export type NewSocialFeedPost = typeof socialFeedPosts.$inferInsert;
export type SocialFeedPostProp = typeof socialFeedPostProps.$inferSelect;
export type NewSocialFeedPostProp = typeof socialFeedPostProps.$inferInsert;
export type SocialFeedPostComment = typeof socialFeedPostComments.$inferSelect;
export type NewSocialFeedPostComment =
  typeof socialFeedPostComments.$inferInsert;
export type FeedRepost = typeof feedReposts.$inferSelect;
export type NewFeedRepost = typeof feedReposts.$inferInsert;
export type FeedRepostSourceType = (typeof FEED_REPOST_SOURCE_TYPES)[number];
export type ContentMention = typeof contentMentions.$inferSelect;
export type NewContentMention = typeof contentMentions.$inferInsert;
export type MentionSourceType = (typeof MENTION_SOURCE_TYPES)[number];
export type SharedGoal = typeof sharedGoals.$inferSelect;
export type NewSharedGoal = typeof sharedGoals.$inferInsert;
export type SharedGoalParticipant = typeof sharedGoalParticipants.$inferSelect;
export type NewSharedGoalParticipant =
  typeof sharedGoalParticipants.$inferInsert;
export type SharedGoalMode = (typeof SHARED_GOAL_MODES)[number];
export type SharedGoalScoringType = (typeof SHARED_GOAL_SCORING_TYPES)[number];
export type SharedGoalStatus = (typeof SHARED_GOAL_STATUSES)[number];
export type SharedGoalStakeType = (typeof SHARED_GOAL_STAKE_TYPES)[number];
export type SharedGoalParticipantStatus =
  (typeof SHARED_GOAL_PARTICIPANT_STATUSES)[number];

export const friendMessages = pgTable(
  "friend_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    friendshipId: uuid("friendship_id")
      .notNull()
      .references(() => friends.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: friendMessageTypeEnum("type").notNull(),
    body: text("body").notNull(),
    accepted: boolean("accepted"),
    streakDays: integer("streak_days"),
    streakPercent: integer("streak_percent"),
    goalScope: friendGoalScopeEnum("goal_scope"),
    targetType: friendGoalTargetTypeEnum("target_type")
      .default("habit")
      .notNull(),
    goalId: uuid("goal_id").references(() => habits.id, {
      onDelete: "set null",
    }),
    planGoalId: uuid("plan_goal_id").references(() => goals.id, {
      onDelete: "set null",
    }),
    incentiveCompletedAt: timestamp("incentive_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("friend_messages_friendship_id_idx").on(table.friendshipId),
    index("friend_messages_sender_id_idx").on(table.senderId),
    index("friend_messages_recipient_id_idx").on(table.recipientId),
    index("friend_messages_plan_goal_id_idx").on(table.planGoalId),
  ],
);

export const calendarSettings = pgTable("calendar_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  visibleCategoryIds: text("visible_category_ids")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  monthlyGoalSlots: integer("monthly_goal_slots").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(true),
  defaultPlanReportView: text("default_plan_report_view")
    .notNull()
    .default("day-plan"),
  defaultCollabSection: text("default_collab_section")
    .notNull()
    .default("feed"),
  defaultAppStartPage: text("default_app_start_page")
    .notNull()
    .default("collab"),
  // Notification preferences.
  notifyFriendRequests: boolean("notify_friend_requests")
    .notNull()
    .default(true),
  notifyMonthlyGoalToday: boolean("notify_monthly_goal_today")
    .notNull()
    .default(false),
  notifyTasksDueToday: boolean("notify_tasks_due_today")
    .notNull()
    .default(false),
  notifyInactivityReminder: boolean("notify_inactivity_reminder")
    .notNull()
    .default(true),
  notifySharedGoalInvites: boolean("notify_shared_goal_invites")
    .notNull()
    .default(true),
  // Streaks & progress.
  notifyStreakAtRisk: boolean("notify_streak_at_risk").notNull().default(false),
  notifyStreakMilestone: boolean("notify_streak_milestone")
    .notNull()
    .default(false),
  notifyEndOfDayNudge: boolean("notify_end_of_day_nudge")
    .notNull()
    .default(false),
  // Friends & social.
  notifyPostProps: boolean("notify_post_props").notNull().default(false),
  notifyPostComments: boolean("notify_post_comments").notNull().default(true),
  notifyFriendPosts: boolean("notify_friend_posts").notNull().default(false),
  notifyFriendNudges: boolean("notify_friend_nudges").notNull().default(true),
  notifyFriendRequestAccepted: boolean("notify_friend_request_accepted")
    .notNull()
    .default(true),
  notifyFriendMilestone: boolean("notify_friend_milestone")
    .notNull()
    .default(false),
  // Shared goals & incentives.
  notifySharedGoalResponses: boolean("notify_shared_goal_responses")
    .notNull()
    .default(true),
  notifyLastToComplete: boolean("notify_last_to_complete")
    .notNull()
    .default(false),
  notifySharedGoalEnding: boolean("notify_shared_goal_ending")
    .notNull()
    .default(false),
  notifyStakesReminder: boolean("notify_stakes_reminder")
    .notNull()
    .default(false),
  notifyIncentiveEarned: boolean("notify_incentive_earned")
    .notNull()
    .default(false),
  // Planning & recap.
  notifyPlanTomorrow: boolean("notify_plan_tomorrow").notNull().default(false),
  notifyWeeklyRecap: boolean("notify_weekly_recap").notNull().default(false),
  notifyScheduleEvents: boolean("notify_schedule_events")
    .notNull()
    .default(true),
  dailyNotificationTime: text("daily_notification_time")
    .notNull()
    .default("20:30"),
  weeklyNotificationTime: text("weekly_notification_time")
    .notNull()
    .default("18:00"),
  weeklyNotificationDay: text("weekly_notification_day")
    .notNull()
    .default("sunday"),
  monthlyNotificationTime: text("monthly_notification_time")
    .notNull()
    .default("09:00"),
  monthlyNotificationDay: text("monthly_notification_day")
    .notNull()
    .default("first"),
  timeZone: text("time_zone").notNull().default("America/Denver"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserSettings = typeof userSettings.$inferSelect;

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("push_tokens_user_id_idx").on(table.userId)],
);

export type PushToken = typeof pushTokens.$inferSelect;

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notification_deliveries_user_key_uidx").on(
      table.userId,
      table.dedupeKey,
    ),
    index("notification_deliveries_created_at_idx").on(table.createdAt),
  ],
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;

export type CalendarSettings = typeof calendarSettings.$inferSelect;
export type FriendMessage = typeof friendMessages.$inferSelect;
export type NewFriendMessage = typeof friendMessages.$inferInsert;
export type FriendMessageType = (typeof FRIEND_MESSAGE_TYPES)[number];
export type FriendGoalScope = (typeof FRIEND_GOAL_SCOPES)[number];
