import path from "path"
import fs from "fs/promises"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { PermissionMode } from "./PermissionMode"
import { Instance } from "@/project/instance"

export namespace TrustGate {
  const log = Log.create({ service: "trustgate" })
  const TRUST_FILE = ".kilo-trusted"

  export async function check(directory: string): Promise<"trusted" | "untrusted"> {
    const trustFile = path.join(directory, TRUST_FILE)
    try {
      await fs.access(trustFile)
      return "trusted"
    } catch {
      return "untrusted"
    }
  }

  export async function markTrusted(directory: string): Promise<void> {
    const trustFile = path.join(directory, TRUST_FILE)
    await fs.writeFile(trustFile, `Trusted by user at ${new Date().toISOString()}`)
    log.debug("marked directory as trusted", { directory })
  }

  export async function enforce(mode: PermissionMode.Mode, directory: string): Promise<void> {
    const trustStatus = await check(directory)

    if (trustStatus === "untrusted" && mode !== "bypass") {
      log.warn("directory is untrusted, ignoring project permission rules", { directory })
    }
  }

  export async function loadSettingsAfterTrust(directory: string): Promise<Config.Info> {
    const trustStatus = await check(directory)

    if (trustStatus === "untrusted") {
      log.info("loading config without project permission rules for untrusted directory", { directory })
      const config = await Config.get()
      if (config.permission) {
        const filtered: Config.Permission = {}
        for (const [key, value] of Object.entries(config.permission)) {
          if (key === "mode") {
            filtered[key as keyof Config.Permission] = value as never
            continue
          }
          if (key === "__originalKeys") continue
        }
        config.permission = filtered
      }
      return config
    }

    return Config.get()
  }
}
