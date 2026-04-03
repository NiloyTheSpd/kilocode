import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { StreamFormatter } from "@/output/StreamFormatter"

describe("StreamFormatter", () => {
  test("text format returns text as-is", () => {
    const fmt = StreamFormatter.create("text")
    expect(fmt.text("hello")).toBe("hello")
    expect(fmt.done()).toBe("\nDone.\n")
  })

  test("json format wraps in JSON with newline", () => {
    const fmt = StreamFormatter.create("json")
    expect(JSON.parse(fmt.text("hello"))).toEqual({ type: "text", text: "hello" })
    expect(JSON.parse(fmt.done())).toEqual({ type: "done" })
  })

  test("stream-json format uses SSE events", () => {
    const fmt = StreamFormatter.create("stream-json")
    expect(fmt.text("hello")).toBe('event: text\ndata: {"text":"hello"}\n\n')
    expect(fmt.done()).toBe("event: done\ndata: {}\n\n")
  })

  test("json toolCall includes tool name and input", () => {
    const fmt = StreamFormatter.create("json")
    const result = JSON.parse(fmt.toolCall("edit", { path: "test.ts" }))
    expect(result).toEqual({ type: "tool_call", tool: "edit", input: { path: "test.ts" } })
  })

  test("stream-json toolCall uses SSE event format", () => {
    const fmt = StreamFormatter.create("stream-json")
    const result = fmt.toolCall("bash", { command: "ls" })
    expect(result).toContain("event: tool_call")
    expect(result).toContain('"tool":"bash"')
  })

  test("text toolCall formats as human-readable arrow", () => {
    const fmt = StreamFormatter.create("text")
    expect(fmt.toolCall("read", { path: "test.ts" })).toContain("→ read")
  })

  test("error format includes message", () => {
    const fmt = StreamFormatter.create("json")
    const result = JSON.parse(fmt.error(new Error("test error")))
    expect(result).toEqual({ type: "error", message: "test error" })
  })

  test("stream-json error uses SSE event format", () => {
    const fmt = StreamFormatter.create("stream-json")
    const result = fmt.error(new Error("test error"))
    expect(result).toContain("event: error")
    expect(result).toContain('"message":"test error"')
  })
})
