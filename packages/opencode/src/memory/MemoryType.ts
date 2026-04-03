import z from "zod"

export namespace MemoryType {
  export const Type = z.enum(["project_facts", "user_preferences", "task_context", "episodic"])
  export type Type = z.infer<typeof Type>

  export const Entry = z.object({
    id: z.string(),
    type: Type,
    content: z.string(),
    projectID: z.string(),
    sessionID: z.string().optional(),
    created: z.number(),
    updated: z.number(),
    private: z.boolean().default(false),
  })
  export type Entry = z.infer<typeof Entry>
}
