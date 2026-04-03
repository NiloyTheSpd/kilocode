import path from "path"
import z from "zod"
import { Filesystem } from "@/util/filesystem"
import { Config } from "@/config/config"
import { Log } from "@/util/log"

export namespace McpConfig {
  const log = Log.create({ service: "mcp-config" })

  export const Settings = z.object({
    mcpServers: z.record(z.string(), z.any()).optional(),
    mcp: z.record(z.string(), z.any()).optional(),
  })
  export type Settings = z.infer<typeof Settings>

  const MCP_FILES = ["mcp.json", "mcp.jsonc"]
  const MCP_DIRS = [".kilo", ".kilocode", ".opencode"]

  export async function load(directory: string): Promise<Record<string, Config.Mcp>> {
    const result: Record<string, Config.Mcp> = {}
    const resolved = path.resolve(directory)

    for (const dirName of MCP_DIRS) {
      const dirPath = path.join(resolved, dirName)
      if (!(await Filesystem.exists(dirPath))) continue

      for (const file of MCP_FILES) {
        const filePath = path.join(dirPath, file)
        if (!(await Filesystem.exists(filePath))) continue

        const parsed = await loadFile(filePath)
        if (!parsed) continue

        if (parsed.mcp) {
          for (const [name, entry] of Object.entries(parsed.mcp)) {
            const validated = Config.Mcp.safeParse(entry)
            if (validated.success) {
              result[name] = validated.data
            } else {
              log.warn("invalid MCP config entry", { file: filePath, name })
            }
          }
        }

        if (parsed.mcpServers) {
          for (const [name, entry] of Object.entries(parsed.mcpServers)) {
            const converted = convertLegacy(entry as any)
            if (converted) {
              result[name] = converted
            }
          }
        }
      }
    }

    return result
  }

  async function loadFile(filePath: string): Promise<Settings | null> {
    try {
      const content = await Filesystem.readText(filePath)
      const parsed = JSON.parse(content)
      return Settings.parse(parsed)
    } catch {
      return null
    }
  }

  function convertLegacy(legacy: any): Config.Mcp | null {
    if (legacy.disabled) return null

    if (legacy.url) {
      return {
        type: "remote",
        url: legacy.url,
        headers: legacy.headers,
        enabled: legacy.disabled !== true,
      }
    }

    if (legacy.command || legacy.args) {
      return {
        type: "local",
        command: [legacy.command ?? "node", ...(legacy.args ?? [])],
        environment: legacy.env,
        enabled: legacy.disabled !== true,
      }
    }

    return null
  }
}
