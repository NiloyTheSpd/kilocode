import { Log } from "@/util/log"
import { Config } from "@/config/config"

export namespace HookValidator {
  const log = Log.create({ service: "hook-validator" })

  const DANGEROUS_COMMANDS = [
    /\brm\s+(-rf?|--recursive)\s+\/\b/,
    /\bmkfs\b/,
    /\bdd\b/,
    /\bformat\s+[a-zA-Z]:\\/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bsudo\b.*\bpasswd\b/,
    /\bchmod\s+[0-7]*7[0-7]{2}\s+\/\b/,
  ]

  const ALLOWED_HOOK_EVENTS = new Set([
    "turn.start", "turn.end",
    "step.start", "step.end",
    "tool.before", "tool.after", "tool.error",
    "error", "compaction.end",
  ])

  export function validate(config: Config.Info): boolean {
    if (!config.hook) return true

    for (const [name, hook] of Object.entries(config.hook)) {
      if (!ALLOWED_HOOK_EVENTS.has(name)) {
        log.warn("unknown hook event", { name })
        return false
      }

      if (hook.command) {
        for (const pattern of DANGEROUS_COMMANDS) {
          if (pattern.test(hook.command)) {
            log.warn("dangerous command in hook", { name, command: hook.command.slice(0, 60) })
            return false
          }
        }
      }

      if (hook.url) {
        try {
          const url = new URL(hook.url)
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            log.warn("invalid hook URL protocol", { name, protocol: url.protocol })
            return false
          }
        } catch {
          log.warn("invalid hook URL", { name, url: hook.url })
          return false
        }
      }

      if (hook.timeout !== undefined && (hook.timeout < 0 || hook.timeout > 60000)) {
        log.warn("invalid hook timeout", { name, timeout: hook.timeout })
        return false
      }
    }

    return true
  }
}
