import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { Process } from "@/util/process"

export namespace HookRunner {
  const log = Log.create({ service: "hook" })

  export const Event = {
    TurnStart: "turn.start",
    TurnEnd: "turn.end",
    StepStart: "step.start",
    StepEnd: "step.end",
    ToolBefore: "tool.before",
    ToolAfter: "tool.after",
    ToolError: "tool.error",
    Error: "error",
    CompactionEnd: "compaction.end",
  }

  type HookConfig = NonNullable<NonNullable<Config.Info["hook"]>[string]>

  export async function fire(name: string, payload: Record<string, unknown>): Promise<void> {
    if (Flag.KILO_BARE) return

    const config = await Config.get()
    const hookConfig = config.hook?.[name]
    if (!hookConfig) return

    await Promise.allSettled([
      fireCommand(hookConfig, name, payload),
      fireHttp(hookConfig, name, payload),
    ])
  }

  async function fireCommand(hook: HookConfig, name: string, payload: Record<string, unknown>): Promise<void> {
    if (!hook.command) return

    const timeout = hook.timeout ?? 5000
    const env = {
      ...process.env,
      ...hook.env,
      KILO_HOOK_EVENT: name,
      KILO_HOOK_PAYLOAD: JSON.stringify(payload),
    }

    try {
      const proc = Process.spawn(["sh", "-c", hook.command], {
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout,
      })

      const code = await proc.exited

      if (code !== 0) {
        log.error("hook command failed", { name, code })
        if (!hook.continue_on_error) throw new Error(`Hook command failed with code ${code}`)
      }
    } catch (err) {
      log.error("hook command error", { name, error: err })
      if (!hook.continue_on_error) throw err
    }
  }

  async function fireHttp(hook: HookConfig, name: string, payload: Record<string, unknown>): Promise<void> {
    if (!hook.url) return

    const timeout = hook.timeout ?? 5000

    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: name, payload }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        log.error("hook HTTP request failed", { name, status: response.status })
        if (!hook.continue_on_error) throw new Error(`Hook HTTP request failed with status ${response.status}`)
      }
    } catch (err) {
      log.error("hook HTTP error", { name, error: err })
      if (!hook.continue_on_error) throw err
    }
  }
}
