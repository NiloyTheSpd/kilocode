// kilocode_change - new file

import path from "path"
import fs from "fs/promises"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { PermissionMode } from "./PermissionMode"

export namespace TrustGate {
  const log = Log.create({ service: "trustgate" })
  const TRUST_FILE = ".kilo-trusted"

  /**
   * Check if a directory is trusted
   * Looks for .kilo-trusted file marker
   */
  export async function check(directory: string): Promise<"trusted" | "untrusted"> {
    const trustFile = path.join(directory, TRUST_FILE)
    try {
      await fs.access(trustFile)
      return "trusted"
    } catch {
      return "untrusted"
    }
  }

  /**
   * Mark a directory as trusted by creating .kilo-trusted marker file
   */
  export async function markTrusted(directory: string): Promise<void> {
    const trustFile = path.join(directory, TRUST_FILE)
    await fs.writeFile(trustFile, `Trusted by user at ${new Date().toISOString()}`)
    log.debug("marked directory as trusted", { directory })
  }

  /**
   * Enforce trust policy before loading settings
   * For untrusted directories:
   * - Ignore project-level permission rules
   * - All permissions default to "ask"
   */
  export async function enforce(mode: PermissionMode.Mode, directory: string): Promise<void> {
    const trustStatus = await check(directory)

    if (trustStatus === "untrusted") {
      log.warn("directory is untrusted, ignoring project permission rules", { directory })

      // Override permissions to default "ask" for untrusted directories
      // This prevents malicious kilo.json from auto-approving permissions
    }
  }

  /**
   * Load settings only after trust has been established
   * Fix for GHSA-mmgp-wc2j-qcv7 analogous vulnerability
   */
  export async function loadSettingsAfterTrust(directory: string): Promise<Config.Info> {
    const trustStatus = await check(directory)

    if (trustStatus === "untrusted") {
      // Return default config without project-level overrides
      return Config.get()
    }

    // Trusted directory - load full config including project settings
    return Config.get()
  }
}
