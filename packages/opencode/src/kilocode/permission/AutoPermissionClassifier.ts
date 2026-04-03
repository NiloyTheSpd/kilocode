import z from "zod"
import { Log } from "@/util/log"

export namespace AutoPermissionClassifier {
  const log = Log.create({ service: "classifier" })

  export const Request = z.object({
    tool: z.string(),
    input: z.record(z.string(), z.any()),
    pattern: z.string(),
  })
  export type Request = z.infer<typeof Request>

  export const Decision = z.object({
    action: z.enum(["allow", "deny"]),
    confidence: z.number().min(0).max(1),
    reason: z.string().optional(),
  })
  export type Decision = z.infer<typeof Decision>

  const SAFE_TOOLS = new Set([
    "read", "glob", "grep", "codesearch", "webfetch", "websearch",
    "todoread", "question", "skill", "lsp", "ls",
  ])

  const DESTRUCTIVE_TOOLS = new Set([
    "bash", "edit", "write", "patch", "multiedit",
  ])

  const SAFE_BASH_PATTERNS = [
    /^ls\b/, /^cat\b/, /^head\b/, /^tail\b/, /^wc\b/,
    /^find\b.*-type f\b/, /^echo\b/, /^date\b/, /^pwd\b/,
    /^git\s+(status|log|diff|show|branch)\b/,
    /^pnpm\s+test\b/, /^npm\s+test\b/, /^bun\s+test\b/,
    /^yarn\s+test\b/,
  ]

  const DANGEROUS_BASH_PATTERNS = [
    /\brm\s+(-rf?|--recursive)\b/,
    /\bsudo\b/,
    /\bcurl\b.*\|\s*(ba)?sh\b/,
    /\bchmod\s+[0-7]*7[0-7]*\b/,
    /\bchown\b/,
    /\bmkfs\b/,
    /\bdd\b/,
    /\bformat\b/,
    /\bshutdown\b/,
    /\breboot\b/,
  ]

  export async function classify(request: Request): Promise<Decision> {
    if (SAFE_TOOLS.has(request.tool)) {
      return {
        action: "allow",
        confidence: 0.95,
        reason: "Safe read-only tool",
      }
    }

    if (request.tool === "bash" && typeof request.input.command === "string") {
      const cmd = request.input.command.trim()

      for (const pattern of DANGEROUS_BASH_PATTERNS) {
        if (pattern.test(cmd)) {
          return {
            action: "deny",
            confidence: 0.95,
            reason: `Dangerous command pattern detected: ${cmd.slice(0, 60)}`,
          }
        }
      }

      for (const pattern of SAFE_BASH_PATTERNS) {
        if (pattern.test(cmd)) {
          return {
            action: "allow",
            confidence: 0.9,
            reason: `Safe command pattern: ${cmd.slice(0, 60)}`,
          }
        }
      }

      return {
        action: "deny",
        confidence: 0.7,
        reason: `Unknown bash command: ${cmd.slice(0, 60)}`,
      }
    }

    if (DESTRUCTIVE_TOOLS.has(request.tool)) {
      return {
        action: "deny",
        confidence: 0.9,
        reason: "Destructive tool requires explicit approval",
      }
    }

    return {
      action: "deny",
      confidence: 0.5,
      reason: "Unknown tool requires explicit approval",
    }
  }
}
