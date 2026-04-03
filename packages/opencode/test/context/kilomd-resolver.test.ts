import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import path from "path"
import { KiloMdResolver } from "../../src/context/KiloMdResolver"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { tmpdir } from "../fixture/fixture"

describe("KiloMdResolver.resolve", () => {
  test("returns empty result when no KILO.md files exist", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await KiloMdResolver.resolve(tmp.path)
        expect(result.user).toBeUndefined()
        expect(result.project).toBeUndefined()
        expect(result.directories).toEqual([])
      },
    })
  })

  test("collects project-level KILO.md", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "KILO.md"), "# Project KILO.md\n\nProject context.")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await KiloMdResolver.resolve(tmp.path)
        expect(result.project).toBe("# Project KILO.md\n\nProject context.")
        expect(result.user).toBeUndefined()
        expect(result.directories).toEqual([])
      },
    })
  })

  test("collects user-level KILO.md", async () => {
    const originalGlobalConfig = Global.Path.config
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "KILO.md"), "# User KILO.md\n\nUser preferences.")
      },
    })
    ;(Global.Path as { config: string }).config = tmp.path

    try {
      await using projectTmp = await tmpdir()
      await Instance.provide({
        directory: projectTmp.path,
        fn: async () => {
          const result = await KiloMdResolver.resolve(projectTmp.path)
          expect(result.user).toBe("# User KILO.md\n\nUser preferences.")
          expect(result.project).toBeUndefined()
        },
      })
    } finally {
      ;(Global.Path as { config: string }).config = originalGlobalConfig
    }
  })

  test("collects directory-level KILO.md files (excluding project root)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "KILO.md"), "# Project KILO.md")
        await Bun.write(path.join(dir, "src", "KILO.md"), "# Src KILO.md")
        await Bun.write(path.join(dir, "src", "nested", "KILO.md"), "# Nested KILO.md")
        await Bun.write(path.join(dir, "src", "nested", "file.ts"), "const x = 1")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await KiloMdResolver.resolve(path.join(tmp.path, "src", "nested"))
        expect(result.project).toBe("# Project KILO.md")
        expect(result.directories.length).toBe(2)
        expect(result.directories[0].path).toBe(path.join(tmp.path, "src", "KILO.md"))
        expect(result.directories[1].path).toBe(path.join(tmp.path, "src", "nested", "KILO.md"))
      },
    })
  })

  test("respects KILO_DISABLE_PROJECT_CONFIG flag", async () => {
    const originalFlag = process.env["KILO_DISABLE_PROJECT_CONFIG"]
    process.env["KILO_DISABLE_PROJECT_CONFIG"] = "1"

    try {
      await using tmp = await tmpdir({
        init: async (dir) => {
          await Bun.write(path.join(dir, "KILO.md"), "# Should be ignored")
        },
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const result = await KiloMdResolver.resolve(tmp.path)
          expect(result.project).toBeUndefined()
          expect(result.directories).toEqual([])
        },
      })
    } finally {
      if (originalFlag === undefined) {
        delete process.env["KILO_DISABLE_PROJECT_CONFIG"]
      } else {
        process.env["KILO_DISABLE_PROJECT_CONFIG"] = originalFlag
      }
    }
  })
})

describe("KiloMdResolver.inject", () => {
  test("returns original systemPrompt when no KILO.md content", async () => {
    const result: KiloMdResolver.Result = {
      user: undefined,
      project: undefined,
      directories: [],
    }
    const systemPrompt = "Original system prompt"
    const injected = KiloMdResolver.inject(result, systemPrompt)
    expect(injected).toBe(systemPrompt)
  })

  test("injects user KILO.md into system prompt", async () => {
    const result: KiloMdResolver.Result = {
      user: "# User KILO.md\n\nUser content.",
      project: undefined,
      directories: [],
    }
    const systemPrompt = "Original system prompt"
    const injected = KiloMdResolver.inject(result, systemPrompt)
    expect(injected).toContain("## KILO.md Context")
    expect(injected).toContain("## User KILO.md")
    expect(injected).toContain("User content.")
  })

  test("injects project KILO.md into system prompt", async () => {
    const result: KiloMdResolver.Result = {
      user: undefined,
      project: "# Project KILO.md\n\nProject content.",
      directories: [],
    }
    const systemPrompt = "Original system prompt"
    const injected = KiloMdResolver.inject(result, systemPrompt)
    expect(injected).toContain("## KILO.md Context")
    expect(injected).toContain("## Project KILO.md")
    expect(injected).toContain("Project content.")
  })

  test("injects all tiers in correct order", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "KILO.md"), "# Project KILO.md")
        await Bun.write(path.join(dir, "src", "KILO.md"), "# Src KILO.md")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result: KiloMdResolver.Result = {
          user: "# User KILO.md",
          project: "# Project KILO.md",
          directories: [
            { path: path.join(tmp.path, "src", "KILO.md"), content: "# Src KILO.md" },
          ],
        }
        const systemPrompt = "Original system prompt"
        const injected = KiloMdResolver.inject(result, systemPrompt, tmp.path)
        const userIdx = injected.indexOf("## User KILO.md")
        const projectIdx = injected.indexOf("## Project KILO.md")
        const srcIdx = injected.indexOf("## Directory KILO.md")

        expect(userIdx).toBeGreaterThan(-1)
        expect(projectIdx).toBeGreaterThan(-1)
        expect(srcIdx).toBeGreaterThan(-1)
        expect(userIdx).toBeLessThan(projectIdx)
        expect(projectIdx).toBeLessThan(srcIdx)
      },
    })
  })

  test("truncates content exceeding 40K char limit", async () => {
    const longContent = "A".repeat(50000)
    const result: KiloMdResolver.Result = {
      user: undefined,
      project: longContent,
      directories: [],
    }
    const systemPrompt = "Original system prompt"
    const injected = KiloMdResolver.inject(result, systemPrompt)
    expect(injected.length).toBeLessThan(50000)
    expect(injected).toContain("[...truncated to 40K char limit]")
  })
})

describe("KiloMdResolver.system", () => {
  test("returns null when no KILO.md files exist", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await KiloMdResolver.system()
        expect(result).toBeNull()
      },
    })
  })

  test("returns combined KILO.md content when files exist", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "KILO.md"), "# Project KILO.md\n\nProject context.")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await KiloMdResolver.system()
        expect(result).not.toBeNull()
        expect(result).toContain("## Project KILO.md")
        expect(result).toContain("Project context.")
      },
    })
  })
})
