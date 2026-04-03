import path from "path"
import { Config } from "../config/config"

export async function isPathWithinAllowedDirs(location: string): Promise<boolean> {
  const resolved = path.resolve(location)
  const dirs = await Config.directories()
  return dirs.some((dir) => {
    const absDir = path.resolve(dir)
    return resolved.startsWith(absDir + path.sep) || resolved === absDir
  })
}
