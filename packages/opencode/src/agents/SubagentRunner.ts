import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { MessageV2 } from "@/session/message-v2"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { PermissionNext } from "@/permission/next"
import { Instance } from "@/project/instance"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { SubagentSpec } from "./SubagentSpec"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"

export namespace SubagentRunner {
  const log = Log.create({ service: "subagent-runner" })

  export const Result = z.object({
    output: z.string(),
    files: z.string().array(),
    cost: z.number(),
    tokens: z.object({ input: z.number(), output: z.number() }),
    sessionID: z.string(),
    status: z.enum(["completed", "error", "timeout"]),
  })
  export type Result = z.infer<typeof Result>

  export const Event = {
    Spawned: BusEvent.define("subagent.spawned", z.object({
      sessionID: z.string(),
      parentID: z.string(),
      description: z.string(),
      subagent_type: z.string(),
    })),
    Completed: BusEvent.define("subagent.completed", z.object({
      sessionID: z.string(),
      parentID: z.string(),
      description: z.string(),
      status: z.enum(["completed", "error", "timeout"]),
    })),
  }

  export async function spawn(spec: SubagentSpec.Spec, parentSessionID: string): Promise<Result> {
    const agent = await Agent.get(spec.subagent_type)
    if (!agent) throw new Error(`Agent "${spec.subagent_type}" not found`)

    const config = await Config.get()
    const parentMsgs: MessageV2.WithParts[] = []
    for await (const msg of MessageV2.stream(parentSessionID)) {
      parentMsgs.push(msg)
    }
    const parentAssistant = parentMsgs.findLast((m) => m.info.role === "assistant") as MessageV2.Assistant | undefined
    const parentModel = parentAssistant
      ? { modelID: parentAssistant.modelID, providerID: parentAssistant.providerID }
      : undefined

    const resolved = spec.model
      ? spec.model
      : agent.model
        ? agent.model
        : parentModel
          ? parentModel
          : await Provider.defaultModel()

    const model = await Provider.getModel(resolved.providerID, resolved.modelID)

    const childSession = await Session.createNext({
      title: spec.description,
      parentID: parentSessionID,
      directory: Instance.directory,
      permission: buildRestrictedPermissions(spec),
    })

    Bus.publish(Event.Spawned, {
      sessionID: childSession.id,
      parentID: parentSessionID,
      description: spec.description,
      subagent_type: spec.subagent_type,
    })

    try {
      const toolsConfig = spec.allowed_tools
        ? {
          ...Object.fromEntries(spec.allowed_tools.map((t) => [t, true])),
        }
        : undefined

      const promptPromise = SessionPrompt.prompt({
        sessionID: childSession.id,
        agent: spec.subagent_type,
        model: resolved,
        parts: [{ type: "text", text: spec.prompt }],
        tools: toolsConfig,
      })

      let result: Result
      if (spec.timeout_ms) {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(async () => {
            await SessionPrompt.cancel(childSession.id)
            reject(new Error(`Subagent timed out after ${spec.timeout_ms}ms`))
          }, spec.timeout_ms),
        )
        result = await Promise.race([promptPromise.then(() => extractResult(childSession.id)), timeout.then(() => ({
          output: `Subagent timed out after ${spec.timeout_ms}ms`,
          files: [],
          cost: 0,
          tokens: { input: 0, output: 0 },
          sessionID: childSession.id,
          status: "timeout" as const,
        }))])
      } else {
        result = await promptPromise.then(() => extractResult(childSession.id))
      }

      Bus.publish(Event.Completed, {
        sessionID: childSession.id,
        parentID: parentSessionID,
        description: spec.description,
        status: result.status,
      })

      return result
    } catch (err) {
      const status = err instanceof Error && err.message.includes("timed out") ? "timeout" : "error"
      Bus.publish(Event.Completed, {
        sessionID: childSession.id,
        parentID: parentSessionID,
        description: spec.description,
        status,
      })
      log.error("subagent failed", { sessionID: childSession.id, error: err })
      return {
        output: `Subagent failed: ${err instanceof Error ? err.message : String(err)}`,
        files: [],
        cost: 0,
        tokens: { input: 0, output: 0 },
        sessionID: childSession.id,
        status,
      }
    }
  }

  export async function spawnParallel(specs: SubagentSpec.Spec[], parentSessionID: string): Promise<Result[]> {
    return Promise.all(specs.map((s) => spawn(s, parentSessionID)))
  }

  export async function spawnWithWaves(specs: SubagentSpec.Spec[], parentSessionID: string): Promise<Result[]> {
    const waves = SubagentSpec.buildWaves(specs)
    const allResults: Result[] = []

    for (const wave of waves) {
      const results = await spawnParallel(wave.tasks, parentSessionID)
      allResults.push(...results)
    }

    return allResults
  }

  function buildRestrictedPermissions(spec: SubagentSpec.Spec): PermissionNext.Ruleset {
    const defaults: PermissionNext.Ruleset = [
      { permission: "todowrite", pattern: "*", action: "deny" },
      { permission: "todoread", pattern: "*", action: "deny" },
      { permission: "task", pattern: "*", action: "deny" },
    ]

    if (spec.allowed_tools && spec.allowed_tools.length > 0) {
      defaults.push({ permission: "*", pattern: "*", action: "deny" })
      for (const tool of spec.allowed_tools) {
        defaults.push({ permission: tool, pattern: "*", action: "allow" })
      }
    }

    return PermissionNext.merge(
      defaults,
      PermissionNext.fromConfig({
        read: "allow",
        edit: "allow",
        write: "allow",
        patch: "allow",
        multiedit: "allow",
        bash: "allow",
        glob: "allow",
        grep: "allow",
        list: "allow",
        webfetch: "allow",
        websearch: "allow",
        codesearch: "allow",
        lsp: "allow",
        skill: "allow",
        question: "allow",
      }),
    )
  }

  async function extractResult(sessionID: string): Promise<Result> {
    const msgs: MessageV2.WithParts[] = []
    for await (const msg of MessageV2.stream(sessionID)) {
      msgs.push(msg)
    }

    const assistantMsgs = msgs.filter((m) => m.info.role === "assistant")
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1]

    const textParts = lastAssistant?.parts?.filter((p) => p.type === "text") ?? []
    const output = textParts.map((p) => ("text" in p ? p.text : "")).join("\n")

    return {
      output: output || "<task_result>No output</task_result>",
      files: [],
      cost: 0,
      tokens: { input: 0, output: 0 },
      sessionID,
      status: "completed",
    }
  }
}
