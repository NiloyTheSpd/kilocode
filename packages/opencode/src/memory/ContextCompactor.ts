import { MessageV2 } from "@/session/message-v2"
import { Provider } from "@/provider/provider"
import { MemoryType } from "./MemoryType"
import { MemoryStore } from "./MemoryStore"
import { Log } from "@/util/log"

export namespace ContextCompactor {
  const log = Log.create({ service: "context-compactor" })

  const MEMORY_INJECT_THRESHOLD = 0.7

  export async function compact(
    messages: MessageV2.WithParts[],
    model: Provider.Model,
    memories: MemoryType.Entry[],
  ): Promise<{ messages: MessageV2.WithParts[]; systemPrompt: string }> {
    const contextLimit = model.limit.context
    if (contextLimit === 0) return { messages, systemPrompt: "" }

    const totalTokens = messages.reduce((sum, m) => {
      if (m.info.role === "assistant") {
        return sum + (m.info.tokens?.total ?? m.info.tokens?.input ?? 0) + (m.info.tokens?.output ?? 0)
      }
      return sum
    }, 0)

    if (totalTokens < contextLimit * MEMORY_INJECT_THRESHOLD) {
      return { messages, systemPrompt: "" }
    }

    const relevant = await MemoryStore.relevant(
      messages.map((m) => {
        if (m.info.role === "user") {
          const textPart = m.parts.find((p) => p.type === "text")
          return textPart && "text" in textPart ? textPart.text : ""
        }
        return ""
      }).join(" "),
      memories,
    )

    if (relevant.length === 0) return { messages, systemPrompt: "" }

    const memoryBlock = relevant
      .map((m) => `[${m.type}] ${m.content}`)
      .join("\n\n")

    const systemPrompt = `## Persistent Memory\n\n${memoryBlock}`
    log.debug("memory injected into context", { entries: relevant.length, totalTokens, contextLimit })

    return { messages, systemPrompt }
  }
}
