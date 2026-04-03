import path from "path"
import { Filesystem } from "../util/filesystem"
import { Instance } from "../project/instance"
import { Flag } from "@/flag/flag"
import { Log } from "../util/log"
import { Global } from "../global"
import { z } from "zod"

const log = Log.create({ service: "kilomd" })

export namespace KiloMdResolver {
  export const Result = z.object({
    user: z.string().optional(),
    project: z.string().optional(),
    directories: z.array(
      z.object({
        path: z.string(),
        content: z.string(),
      }),
    ),
  })
  export type Result = z.infer<typeof Result>

  export const MAX_CHARS = 40000

  const KILO_MD = "KILO.md"

  export async function resolve(cwd: string): Promise<Result> {
    const result: Result = {
      user: undefined,
      project: undefined,
      directories: [],
    }

    if (Flag.KILO_DISABLE_PROJECT_CONFIG) {
      return result
    }

    const userPath = path.join(Global.Path.config, KILO_MD)
    if (await Filesystem.exists(userPath)) {
      result.user = await Filesystem.readText(userPath).catch(() => undefined)
    }

    const projectRoot = Instance.directory
    const projectPath = path.join(projectRoot, KILO_MD)
    if (await Filesystem.exists(projectPath)) {
      result.project = await Filesystem.readText(projectPath).catch(() => undefined)
    }

    const dirs = await collectDirectoryKiloMd(cwd, projectRoot)
    result.directories = dirs

    return result
  }

  async function collectDirectoryKiloMd(cwd: string, projectRoot: string): Promise<{ path: string; content: string }[]> {
    const results: { path: string; content: string }[] = []
    let current = cwd
    const resolvedRoot = path.resolve(projectRoot)

    while (true) {
      const candidate = path.join(current, KILO_MD)
      if (await Filesystem.exists(candidate)) {
        const resolved = path.resolve(candidate)
        const candidateDir = path.resolve(current)
        if (candidateDir !== resolvedRoot) {
          const content = await Filesystem.readText(resolved).catch(() => undefined)
          if (content) {
            results.push({ path: resolved, content })
          }
        }
      }
      const parent = path.dirname(current)
      if (parent === current || current === resolvedRoot) break
      current = parent
    }

    return results.reverse()
  }

  export function inject(result: Result, systemPrompt: string, projectDir?: string): string {
    const parts: string[] = []

    if (result.user) {
      parts.push(`## User KILO.md\n\n${result.user}`)
    }

    if (result.project) {
      parts.push(`## Project KILO.md\n\n${result.project}`)
    }

    for (const dir of result.directories) {
      const relPath = path.relative(projectDir ?? Instance.directory, dir.path)
      parts.push(`## Directory KILO.md (${relPath})\n\n${dir.content}`)
    }

    if (parts.length === 0) {
      return systemPrompt
    }

    let combined = parts.join("\n\n---\n\n")

    if (combined.length > MAX_CHARS) {
      log.warn(`KILO.md content truncated from ${combined.length} to ${MAX_CHARS} chars`)
      combined = combined.slice(0, MAX_CHARS) + "\n\n[...truncated to 40K char limit]"
    }

    return systemPrompt + "\n\n## KILO.md Context\n\n" + combined
  }

  export async function system(): Promise<string | null> {
    const cwd = Instance.directory
    const resolved = await resolve(cwd)

    const hasContent = resolved.user || resolved.project || resolved.directories.length > 0
    if (!hasContent) {
      return null
    }

    const parts: string[] = []

    if (resolved.user) {
      parts.push(`## User KILO.md\n\n${resolved.user}`)
    }

    if (resolved.project) {
      parts.push(`## Project KILO.md\n\n${resolved.project}`)
    }

    for (const dir of resolved.directories) {
      const relPath = path.relative(Instance.directory, dir.path)
      parts.push(`## Directory KILO.md (${relPath})\n\n${dir.content}`)
    }

    let combined = parts.join("\n\n---\n\n")

    if (combined.length > MAX_CHARS) {
      log.warn(`KILO.md content truncated from ${combined.length} to ${MAX_CHARS} chars`)
      combined = combined.slice(0, MAX_CHARS) + "\n\n[...truncated to 40K char limit]"
    }

    return combined
  }
}
