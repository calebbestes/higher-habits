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
export const LOG_STATUSES = ["complete", "incomplete"] as const;

export const goalPeriodEnum = pgEnum("goal_period", GOAL_PERIODS);
export const goalPriorityEnum = pgEnum("goal_priority", GOAL_PRIORITIES);
export const logStatusEnum = pgEnum("log_status", LOG_STATUSES);

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
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type GoalLog = typeof goalLogs.$inferSelect;
export type NewGoalLog = typeof goalLogs.$inferInsert;
