// kilocode_change - new file

import z from "zod"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { glob } from "glob"
import { Log } from "@/util/log"

export namespace KiloMdResolver {
  const log = Log.create({ service: "kilomd" })

  export const Result = z.object({
    user: z.string().optional(),
    project: z.string().optional(),
    directories: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })),
  }).meta({ ref: "KiloMdResult" })
  export type Result = z.infer<typeof Result>

  export const MAX_CHARS = 40000

  /**
   * Resolve KILO.md files in 3 tiers:
   * 1. User: ~/.kilo/KILO.md
   * 2. Project: ./KILO.md
   * 3. Directories: subdirectories containing KILO.md files (walk up from CWD to project root)
   */
  export async function resolve(cwd: string): Promise<Result> {
    const result: Result = { directories: [] }

    // 1. User tier - ~/.kilo/KILO.md
    try {
      const userKiloMd = path.join(os.homedir(), ".kilo", "KILO.md")
      result.user = await fs.readFile(userKiloMd, "utf8").catch(() => undefined)
      if (result.user) log.debug("loaded user KILO.md")
    } catch {
      // Ignore - user may not have global KILO.md
    }

    // 2. Project tier - ./KILO.md
    try {
      const projectKiloMd = path.join(cwd, "KILO.md")
      result.project = await fs.readFile(projectKiloMd, "utf8").catch(() => undefined)
      if (result.project) log.debug("loaded project KILO.md")
    } catch {
      // Ignore - project may not have KILO.md
    }

    // 3. Directory tier - walk up from CWD to root, collect KILO.md files
    try {
      let current = cwd
      const root = path.parse(cwd).root

      while (current && current !== root) {
        const kiloMdPath = path.join(current, "KILO.md")
        const content = await fs.readFile(kiloMdPath, "utf8").catch(() => undefined)

        if (content) {
          result.directories.unshift({
            path: kiloMdPath,
            content,
          })
          log.debug("loaded directory KILO.md", { path: kiloMdPath })
        }

        // Stop at git root or project root
        const gitDir = path.join(current, ".git")
        if (await fs.access(gitDir).then(() => true).catch(() => false)) {
          break
        }

        current = path.dirname(current)
      }
    } catch (err) {
      log.warn("failed to walk directories for KILO.md", { error: err })
    }

    return result
  }

  /**
   * Inject KILO.md content into system prompt with proper formatting
   * Respects 40K character limit
   */
  export function inject(result: Result, systemPrompt: string): string {
    const parts: string[] = []

    if (result.user) {
      parts.push("## Global Context")
      parts.push(result.user.trim())
      parts.push("")
    }

    if (result.directories.length > 0) {
      parts.push("## Directory Context")
      for (const dir of result.directories) {
        parts.push(`### ${path.basename(path.dirname(dir.path))}`)
        parts.push(dir.content.trim())
        parts.push("")
      }
    }

    if (result.project) {
      parts.push("## Project Context")
      parts.push(result.project.trim())
      parts.push("")
    }

    if (parts.length === 0) {
      return systemPrompt
    }

    let context = parts.join("\n")

    // Truncate to MAX_CHARS if needed
    if (context.length > MAX_CHARS) {
      log.warn("truncating KILO.md context", { length: context.length, max: MAX_CHARS })
      context = context.slice(0, MAX_CHARS) + "\n\n[context truncated]"
    }

    // Insert before the existing system prompt
    return context + "\n\n" + systemPrompt
  }
}
