import { z } from "zod"

export namespace SubagentSpec {
  export const Spec = z.object({
    id: z.string().describe("Unique task ID for dependency tracking"),
    description: z.string().describe("A short (3-5 words) description of the task"),
    prompt: z.string().describe("The task for the agent to perform"),
    subagent_type: z.string().describe("The type of specialized agent to use for this task"),
    allowed_tools: z.string().array().optional().describe("Restrict subagent to these tools only"),
    max_turns: z.number().int().positive().optional().describe("Maximum autonomous loop iterations for this subagent"),
    model: z.object({
      modelID: z.string(),
      providerID: z.string(),
    }).optional().describe("Override the model for this subagent"),
    return_type: z.enum(["output", "files", "diff"]).default("output").describe("What to return from the subagent"),
    depends_on: z.string().array().optional().describe("Task IDs this subagent depends on (for wave execution)"),
    timeout_ms: z.number().int().positive().optional().describe("Timeout in milliseconds"),
  })
  export type Spec = z.infer<typeof Spec>

  export const Wave = z.object({
    id: z.string(),
    tasks: Spec.array(),
  })
  export type Wave = z.infer<typeof Wave>

  export const Plan = z.object({
    waves: Wave.array(),
  })
  export type Plan = z.infer<typeof Plan>

  export function buildWaves(specs: Spec[]): Wave[] {
    const resolved = new Set<string>()
    const waves: Wave[] = []
    const remaining = [...specs]

    while (remaining.length > 0) {
      const ready = remaining.filter((s) =>
        !s.depends_on || s.depends_on.every((d) => resolved.has(d)),
      )

      if (ready.length === 0) {
        remaining.forEach((s) => {
          waves.push({ id: crypto.randomUUID(), tasks: [s] })
          resolved.add(s.id)
        })
        break
      }

      waves.push({ id: crypto.randomUUID(), tasks: ready })
      ready.forEach((s) => resolved.add(s.id))

      for (const s of ready) {
        const idx = remaining.indexOf(s)
        if (idx !== -1) remaining.splice(idx, 1)
      }
    }

    return waves
  }
}
