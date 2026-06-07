import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const GOAL_PERIODS = ["daily", "weekly", "monthly"] as const;
export const GOAL_PRIORITIES = ["high", "medium", "low"] as const;
export const LOG_STATUSES = ["complete", "incomplete", "planned"] as const;
export const FRIEND_STATUSES = ["requested", "accepted", "archived"] as const;
export const FRIEND_MESSAGE_TYPES = ["message", "incentive"] as const;
export const FRIEND_GOAL_SCOPES = ["all", "shared", "single", "high"] as const;

export const goalPeriodEnum = pgEnum("goal_period", GOAL_PERIODS);
export const goalPriorityEnum = pgEnum("goal_priority", GOAL_PRIORITIES);
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

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique("user_email_unique").on(table.email)],
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

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    importance: text("importance").default("").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    completedAt: date("completed_at", { mode: "string" }),
    timeRequired: text("time_required").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_completed_at_idx").on(table.completedAt),
    index("tasks_created_at_idx").on(table.createdAt),
  ],
);

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
    index("goals_user_id_idx").on(table.userId),
    index("goals_category_id_idx").on(table.categoryId),
    index("goals_priority_idx").on(table.priority),
    unique("goals_user_category_name_uidx").on(
      table.userId,
      table.categoryId,
      table.name,
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
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalLog = typeof goalLogs.$inferSelect;
export type NewGoalLog = typeof goalLogs.$inferInsert;
export type GoalLogPhoto = typeof goalLogPhotos.$inferSelect;
export type NewGoalLogPhoto = typeof goalLogPhotos.$inferInsert;

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
    goalId: uuid("goal_id").references(() => goals.id, {
      onDelete: "set null",
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

export type CalendarSettings = typeof calendarSettings.$inferSelect;
export type FriendMessage = typeof friendMessages.$inferSelect;
export type NewFriendMessage = typeof friendMessages.$inferInsert;
export type FriendMessageType = (typeof FRIEND_MESSAGE_TYPES)[number];
export type FriendGoalScope = (typeof FRIEND_GOAL_SCOPES)[number];
