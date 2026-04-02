// kilocode_change - new file

import z from "zod"
import { Config } from "@/config/config"

export namespace PermissionMode {
  export const Mode = z.enum(["bypass", "allow_edits", "auto"])
  export type Mode = z.infer<typeof Mode>

  const DEFAULT_MODE: Mode = "auto"

  export function fromConfig(mode: string | undefined): Mode {
    if (!mode) return DEFAULT_MODE
    const parsed = Mode.safeParse(mode.toLowerCase())
    return parsed.success ? parsed.data : DEFAULT_MODE
  }

  export function fromFlag(flag: string | undefined): Mode | undefined {
    if (!flag) return undefined
    const parsed = Mode.safeParse(flag.toLowerCase())
    return parsed.success ? parsed.data : undefined
  }

  export function toFlag(mode: Mode): string {
    return `--permission-mode ${mode}`
  }

  export function resolve(configMode: string | undefined, flagMode: string | undefined): Mode {
    return fromFlag(flagMode) ?? fromConfig(configMode)
  }
}
