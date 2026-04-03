import fs from "fs/promises"
import path from "path"
import { Instance } from "../project/instance"
import { Log } from "../util/log"

export namespace OutputStyles {
  const log = Log.create({ service: "output-styles" })

  const STYLES_DIR = ".kilo/output-styles"

  export async function loadStyles(): Promise<Record<string, string>> {
    const styles: Record<string, string> = {}
    const dir = path.join(Instance.worktree, STYLES_DIR)

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const name = entry.name.slice(0, -3)
          const content = await fs.readFile(path.join(dir, entry.name), "utf-8")
          styles[name] = content
        }
      }
    } catch {
      log.info("no styles directory found", { dir })
    }

    return styles
  }

  export function applyStyle(text: string, style: string, styles: Record<string, string>): string {
    const template = styles[style]
    if (!template) return text

    return template
      .replace(/\{\{text\}\}/g, text)
      .replace(/\{\{text-unescaped\}\}/g, text.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
  }
}
