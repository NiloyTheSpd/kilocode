import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { HookValidator } from "@/hook/HookValidator"

describe("HookValidator", () => {
  test("returns true when no hooks configured", () => {
    expect(HookValidator.validate({})).toBe(true)
  })

  test("returns true for valid command hook", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "echo hello" },
      },
    })).toBe(true)
  })

  test("returns true for valid HTTP hook", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.end": { url: "https://example.com/hook" },
      },
    })).toBe(true)
  })

  test("returns false for unknown hook event", () => {
    expect(HookValidator.validate({
      hook: {
        "unknown.event": { command: "echo hello" },
      },
    })).toBe(false)
  })

  test("returns false for dangerous command (rm -rf /)", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "rm -rf /tmp/test" },
      },
    })).toBe(false)
  })

  test("returns false for dangerous command (mkfs)", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "mkfs.ext4 /dev/sda1" },
      },
    })).toBe(false)
  })

  test("returns false for invalid URL protocol", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { url: "file:///etc/passwd" },
      },
    })).toBe(false)
  })

  test("returns false for invalid URL", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { url: "not-a-url" },
      },
    })).toBe(false)
  })

  test("returns false for timeout out of range (negative)", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "echo hello", timeout: -100 },
      },
    })).toBe(false)
  })

  test("returns false for timeout out of range (too large)", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "echo hello", timeout: 120000 },
      },
    })).toBe(false)
  })

  test("returns true for valid timeout within range", () => {
    expect(HookValidator.validate({
      hook: {
        "turn.start": { command: "echo hello", timeout: 3000 },
      },
    })).toBe(true)
  })

  test("returns true for hook with continue_on_error", () => {
    expect(HookValidator.validate({
      hook: {
        "tool.error": { command: "echo error", continue_on_error: true },
      },
    })).toBe(true)
  })
})
