// kilocode_change - new file

import z from "zod"
import { Provider } from "@/provider/provider"
import { Session } from "@/session"
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
    "todoread", "question", "skill", "lsp"
  ])

  const DESTRUCTIVE_TOOLS = new Set([
    "bash", "edit", "write", "patch", "multiedit"
  ])

  /**
   * Simple heuristic classifier for auto permission mode
   * Will be replaced with LLM-based classifier in later phases
   */
  export async function classify(request: Request): Promise<Decision> {
    // 1. Safe tools are always allowed with high confidence
    if (SAFE_TOOLS.has(request.tool)) {
      return {
        action: "allow",
        confidence: 0.95,
        reason: "Safe read-only tool"
      }
    }

    // 2. Destructive tools require user confirmation
    if (DESTRUCTIVE_TOOLS.has(request.tool)) {
      return {
        action: "deny",
        confidence: 0.9,
        reason: "Destructive tool requires explicit approval"
      }
    }

    // 3. Default to user confirmation for unknown tools
    return {
      action: "deny",
      confidence: 0.5,
      reason: "Unknown tool requires explicit approval"
    }
  }
}
