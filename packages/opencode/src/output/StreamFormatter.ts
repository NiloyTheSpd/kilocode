export namespace StreamFormatter {

  export type Format = "text" | "json" | "stream-json"

  export function create(format: Format): {
    toolCall: (tool: string, input: unknown) => string
    toolResult: (tool: string, output: string) => string
    text: (text: string) => string
    error: (error: Error) => string
    done: () => string
  } {
    if (format === "json") {
      return {
        toolCall: (tool, input) =>
          JSON.stringify({ type: "tool_call", tool, input }) + "\n",
        toolResult: (tool, output) =>
          JSON.stringify({ type: "tool_result", tool, output }) + "\n",
        text: (text) =>
          JSON.stringify({ type: "text", text }) + "\n",
        error: (error) =>
          JSON.stringify({ type: "error", message: error.message }) + "\n",
        done: () =>
          JSON.stringify({ type: "done" }) + "\n",
      }
    }

    if (format === "stream-json") {
      return {
        toolCall: (tool, input) =>
          `event: tool_call\ndata: ${JSON.stringify({ tool, input })}\n\n`,
        toolResult: (tool, output) =>
          `event: tool_result\ndata: ${JSON.stringify({ tool, output })}\n\n`,
        text: (text) =>
          `event: text\ndata: ${JSON.stringify({ text })}\n\n`,
        error: (error) =>
          `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`,
        done: () =>
          `event: done\ndata: {}\n\n`,
      }
    }

    return {
      toolCall: (tool, input) =>
        `→ ${tool}(${typeof input === "string" ? input : JSON.stringify(input)})\n`,
      toolResult: (tool, output) =>
        `← ${tool}: ${output.slice(0, 200)}${output.length > 200 ? "..." : ""}\n`,
      text: (text) => text,
      error: (error) => `Error: ${error.message}\n`,
      done: () => "\nDone.\n",
    }
  }
}
