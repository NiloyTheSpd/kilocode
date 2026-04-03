import { describe, expect, test } from "bun:test"
import { MemoryType } from "@/memory/MemoryType"

describe("MemoryType", () => {
  test("parses valid memory types", () => {
    expect(MemoryType.Type.safeParse("project_facts").success).toBe(true)
    expect(MemoryType.Type.safeParse("user_preferences").success).toBe(true)
    expect(MemoryType.Type.safeParse("task_context").success).toBe(true)
    expect(MemoryType.Type.safeParse("episodic").success).toBe(true)
  })

  test("rejects invalid memory types", () => {
    expect(MemoryType.Type.safeParse("invalid").success).toBe(false)
    expect(MemoryType.Type.safeParse("").success).toBe(false)
  })

  test("Entry schema validates required fields", () => {
    const entry = {
      id: "test-1",
      type: "project_facts" as const,
      content: "Test content",
      projectID: "proj-1",
      created: Date.now(),
      updated: Date.now(),
      private: false,
    }
    expect(MemoryType.Entry.safeParse(entry).success).toBe(true)
  })

  test("Entry allows optional sessionID", () => {
    const entry = {
      id: "test-2",
      type: "episodic" as const,
      content: "Session memory",
      projectID: "proj-1",
      sessionID: "sess-1",
      created: Date.now(),
      updated: Date.now(),
      private: true,
    }
    expect(MemoryType.Entry.safeParse(entry).success).toBe(true)
  })
})
