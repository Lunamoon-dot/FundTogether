import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)],
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: varchar("nonce", { length: 32 }).primaryKey(),
  // Null denotes legacy wallet login; linking is bound to an app session.
  sessionHash: varchar("session_hash", { length: 64 }).references(
    () => authSessions.tokenHash,
    { onDelete: "cascade" },
  ),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
