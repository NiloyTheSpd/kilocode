import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { PermissionNext } from "@/permission/next"
import { HookRunner } from "@/hook/HookRunner" // kilocode_change

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
  fork: z.boolean().optional().describe("Inherit full parent context with byte-exact prompt cache sharing"),
  parallel: z.array(z.object({
    description: z.string(),
    prompt: z.string(),
    subagent_type: z.string(),
  })).optional().describe("Launch multiple subagents in parallel"),
})

export const TaskTool = Tool.define("task", async (ctx) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))

  // Filter agents by permissions if agent provided
  const caller = ctx?.agent
  const accessibleAgents = caller
    ? agents.filter((a) => PermissionNext.evaluate("task", a.name, caller.permission).action !== "deny")
    : agents

  const description = DESCRIPTION.replace(
    "{agents}",
    accessibleAgents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const config = await Config.get()

      // Skip permission check when user explicitly invoked via @ or command subtask
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)

      const allowsTask = agent.permission.some((rule) => rule.permission === "task" && rule.action === "allow")
      const msg0 = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg0.info.role !== "assistant") throw new Error("Not an assistant message")

      const model0 = agent.model ?? {
        modelID: (msg0.info as MessageV2.Assistant).modelID,
        providerID: (msg0.info as MessageV2.Assistant).providerID,
      }

      // kilocode_change start - parallel subagent execution
      if (params.parallel && params.parallel.length > 0) {
        const parallelResults = await Promise.all(
          params.parallel.map(async (p) => {
            const subAgent = await Agent.get(p.subagent_type)
            if (!subAgent) throw new Error(`Unknown agent type: ${p.subagent_type}`)
            const subSession = await Session.create({
              parentID: ctx.sessionID,
              title: p.description + ` (@${subAgent.name} subagent)`,
              permission: [
                { permission: "todowrite", pattern: "*", action: "deny" },
                { permission: "todoread", pattern: "*", action: "deny" },
                { permission: "task", pattern: "*", action: "deny" },
              ],
            })
            void HookRunner.fire(HookRunner.Event.SubagentSpawn, {
              sessionID: ctx.sessionID,
              subagentSessionId: subSession.id,
              subagentType: p.subagent_type,
              description: p.description,
            })
            const subModel = subAgent.model ?? { modelID: model0.modelID, providerID: model0.providerID }
            const subResult = await SessionPrompt.prompt({
              sessionID: subSession.id,
              agent: subAgent.name,
              model: { modelID: subModel.modelID, providerID: subModel.providerID },
              parts: await SessionPrompt.resolvePromptParts(p.prompt),
            })
            const subText = subResult.parts.findLast((x) => x.type === "text")?.text ?? ""
            void HookRunner.fire(HookRunner.Event.SubagentComplete, {
              sessionID: ctx.sessionID,
              subagentSessionId: subSession.id,
              subagentType: p.subagent_type,
            })
            return { description: p.description, sessionId: subSession.id, output: subText }
          }),
        )
        const output = parallelResults.map((r) =>
          `## ${r.description}\ntask_id: ${r.sessionId}\n\n<task_result>\n${r.output}\n</task_result>`,
        ).join("\n\n---\n\n")
        return {
          title: params.description,
          metadata: { sessionId: ctx.sessionID, model: model0 },
          output,
        }
      }
      // kilocode_change end

      const session = await iife(async () => {
        if (params.task_id) {
          const found = await Session.get(params.task_id).catch(() => {})
          if (found) return found
        }

        // kilocode_change start - fork subagent inherits parent context
        if (params.fork) {
          const forkedSession = await Session.fork({ sessionID: ctx.sessionID })
          void HookRunner.fire(HookRunner.Event.SessionFork, {
            sessionID: ctx.sessionID,
            forkedSessionId: forkedSession.id,
            subagentType: agent.name,
            description: params.description,
          })
          await Session.setTitle({
            sessionID: forkedSession.id,
            title: params.description + ` (@${agent.name} forked subagent)`,
          })
          await Session.setPermission({
            sessionID: forkedSession.id,
            permission: [
              { permission: "todowrite", pattern: "*", action: "deny" },
              { permission: "todoread", pattern: "*", action: "deny" },
              ...(allowsTask ? [] : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
            ],
          })
          return forkedSession
        }
        // kilocode_change end

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
          permission: [
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todoread",
              pattern: "*",
              action: "deny",
            },
            ...(allowsTask
              ? []
              : [
                  {
                    permission: "task" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(config.experimental?.primary_tools?.map((t) => ({
              pattern: "*",
              action: "allow" as const,
              permission: t,
            })) ?? []),
          ],
        })
      })
      const msgModel = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msgModel.info.role !== "assistant") throw new Error("Not an assistant message")

      const model = agent.model ?? {
        modelID: (msgModel.info as MessageV2.Assistant).modelID,
        providerID: (msgModel.info as MessageV2.Assistant).providerID,
      }

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
        },
      })

      const messageID = Identifier.ascending("message")

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          ...(allowsTask ? {} : { task: false }),
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
        },
        parts: promptParts,
      })

      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        text,
        "</task_result>",
      ].join("\n")

      return {
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
        },
        output,
      }
    },
  }
})
