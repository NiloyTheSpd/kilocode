import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@/session/session.sql"
import { ProjectTable } from "@/project/project.sql"

export const MemoryTable = sqliteTable(
  "memory",
  {
    id: text().primaryKey(),
    project_id: text().notNull().references(() => ProjectTable.id, { onDelete: "cascade" }),
    session_id: text().references(() => SessionTable.id, { onDelete: "set null" }),
    content: text().notNull(),
    type: text().notNull(),
    private: integer({ mode: "boolean" }).notNull().default(false),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [
    index("memory_project_idx").on(table.project_id),
    index("memory_type_idx").on(table.type),
    index("memory_session_idx").on(table.session_id),
  ],
)
