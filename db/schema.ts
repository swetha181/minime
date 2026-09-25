import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const prototypeFeedback = sqliteTable("prototype_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  email: text("email").notNull(),
  role: text("role").notNull().default(""),
  helpfulFeature: text("helpful_feature").notNull(),
  feedback: text("feedback").notNull().default(""),
  preorderInterest: text("preorder_interest").notNull(),
  contributionAmount: integer("contribution_amount"),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
