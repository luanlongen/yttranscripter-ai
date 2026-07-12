import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("child_process", () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}))

vi.mock("fs", () => ({
  readdirSync: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("splitAudioByTime", () => {
  it("returns [audioPath] when duration is shorter than segmentMinutes", async () => {
    const { execFile } = await import("child_process")
    ;(execFile as any).mockImplementation((cmd, args, cb) => {
      cb(null, "120", "")
    })

    const { splitAudioByTime } = await import("../audio-chunker.js")
    const result = await splitAudioByTime("/tmp/test.mp3", 5)
    expect(result).toEqual(["/tmp/test.mp3"])
  })

  it("splits audio when duration exceeds segmentMinutes", async () => {
    const { execFile, spawn } = await import("child_process")
    const { readdirSync } = await import("fs")
    ;(execFile as any).mockImplementation((cmd, args, cb) => {
      cb(null, "600", "")
    })
    ;(spawn as any).mockImplementation(() => {
      const { EventEmitter } = require("events")
      const proc = new EventEmitter()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      setTimeout(() => proc.emit("close", 0), 10)
      return proc
    })
    ;(readdirSync as any).mockReturnValue(["test_000.mp3", "test_001.mp3"])

    const { splitAudioByTime } = await import("../audio-chunker.js")
    const result = await splitAudioByTime("/tmp/test.mp3", 5)
    expect(result.length).toBe(2)
    expect(result[0]).toContain("test_000.mp3")
  })

  it("returns [audioPath] as fallback when ffmpeg fails", async () => {
    const { execFile, spawn } = await import("child_process")
    ;(execFile as any).mockImplementation((cmd, args, cb) => {
      cb(null, "600", "")
    })
    ;(spawn as any).mockImplementation(() => {
      const { EventEmitter } = require("events")
      const proc = new EventEmitter()
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      setTimeout(() => proc.emit("close", 1), 10)
      return proc
    })

    const { splitAudioByTime } = await import("../audio-chunker.js")
    const result = await splitAudioByTime("/tmp/test.mp3", 5)
    expect(result).toEqual(["/tmp/test.mp3"])
  })
})
