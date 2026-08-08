import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dashboardSnapshots = sqliteTable("dashboard_snapshots", {
  id: text("id").primaryKey(),
  generatedAt: text("generated_at").notNull(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
