import { Instance } from "@/project/instance"
import { Database, eq, like } from "@/storage/db"
import { MemoryTable } from "@/memory/memory.sql"
import { MemoryType } from "./MemoryType"
import { Log } from "@/util/log"

export namespace MemoryStore {
  const log = Log.create({ service: "memory" })

  const state = Instance.state(async () => {
    const projectID = Instance.project.id
    const entries = await Database.use((db) =>
      db.select().from(MemoryTable).where(eq(MemoryTable.project_id, projectID)),
    )
    return { entries, projectID }
  })

  export async function load(projectID?: string): Promise<MemoryType.Entry[]> {
    const s = await state()
    const pid = projectID ?? s.projectID
    return Database.use((db) =>
      db.select().from(MemoryTable).where(eq(MemoryTable.project_id, pid)),
    ).then((rows) => rows.map(toEntry))
  }

  export async function save(entry: Omit<MemoryType.Entry, "id" | "created" | "updated">): Promise<MemoryType.Entry> {
    const s = await state()
    const now = Date.now()
    const row = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: entry.projectID,
      session_id: entry.sessionID ?? null,
      content: entry.content,
      type: entry.type,
      private: entry.private,
      created_at: now,
      updated_at: now,
    }
    await Database.use((db) => db.insert(MemoryTable).values(row))
    const result = toEntry(row)
    s.entries.push(row)
    log.debug("memory saved", { id: result.id, type: result.type })
    return result
  }

  export async function remove(id: string): Promise<void> {
    await Database.use((db) => db.delete(MemoryTable).where(eq(MemoryTable.id, id)))
    const s = await state()
    s.entries = s.entries.filter((e) => e.id !== id)
  }

  export async function relevant(query: string, entries?: MemoryType.Entry[]): Promise<MemoryType.Entry[]> {
    const all = entries ?? await load()
    if (!query) return all

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return all
      .map((e) => ({
        entry: e,
        score: terms.filter((t) => e.content.toLowerCase().includes(t) || e.type.includes(t)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry)
  }

  export async function clear(projectID?: string): Promise<void> {
    const s = await state()
    const pid = projectID ?? s.projectID
    await Database.use((db) => db.delete(MemoryTable).where(eq(MemoryTable.project_id, pid)))
    s.entries = []
    log.info("memory cleared", { projectID: pid })
  }

  function toEntry(row: typeof MemoryTable.$inferSelect): MemoryType.Entry {
    return {
      id: row.id,
      type: row.type as MemoryType.Type,
      content: row.content,
      projectID: row.project_id,
      sessionID: row.session_id ?? undefined,
      created: row.created_at,
      updated: row.updated_at,
      private: row.private,
    }
  }
}
