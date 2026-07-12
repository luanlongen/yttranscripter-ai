import { describe, it, expect, vi, beforeEach } from "vitest"
import * as os from "os"

const mockCreateWriteStream = vi.fn()
const mockExistsSync = vi.fn()
const mockStatSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockReaddirSync = vi.fn()
const mockRenameSync = vi.fn()

vi.mock("fs", () => ({
  createWriteStream: mockCreateWriteStream,
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  unlinkSync: mockUnlinkSync,
  readdirSync: mockReaddirSync,
  renameSync: mockRenameSync,
}))

const mockYtdlCore = vi.fn()
vi.mock("@distube/ytdl-core", () => ({
  default: mockYtdlCore,
}))

const mockSpawn = vi.fn()
vi.mock("child_process", () => ({
  spawn: mockSpawn,
}))

function fakeWriteStream() {
  const handlers: Record<string, (...args: any[]) => void> = {}
  return {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb
    }),
    write: vi.fn(),
    end: vi.fn(),
    _triggerFinish: () => { if (handlers.finish) handlers.finish() },
  }
}

function fakeEventEmitter() {
  const handlers: Record<string, (...args: any[]) => void> = {}
  return {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb
    }),
    emit: (event: string, ...args: any[]) => {
      if (handlers[event]) handlers[event](...args)
    },
    pipe: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("downloadAudio", () => {
  it("returns audioPath on ytdl-core success", async () => {
    const stream = fakeEventEmitter()
    mockYtdlCore.mockReturnValue(stream)
    const ws = fakeWriteStream()
    mockCreateWriteStream.mockReturnValue(ws)
    mockExistsSync.mockReturnValue(true)
    mockStatSync.mockReturnValue({ size: 1024 })

    const { downloadAudio } = await import("../audio-downloader.js")
    const resultPromise = downloadAudio("https://www.youtube.com/watch?v=test12345", { tmpDir: os.tmpdir() })

    stream.emit("data", Buffer.from("audio data"))
    stream.emit("end")
    ws._triggerFinish()

    const result = await resultPromise
    expect("audioPath" in result).toBe(true)
  })

  it("falls back to yt-dlp when ytdl-core fails", async () => {
    const stream = fakeEventEmitter()
    mockYtdlCore.mockReturnValue(stream)
    const ws = fakeWriteStream()
    mockCreateWriteStream.mockReturnValue(ws)
    mockExistsSync.mockReturnValueOnce(false).mockReturnValue(true)
    mockUnlinkSync.mockImplementation(() => {})
    mockStatSync.mockReturnValue({ size: 2048 })

    const proc = fakeEventEmitter() as any
    proc.stdout = fakeEventEmitter()
    proc.stderr = fakeEventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)

    const { downloadAudio } = await import("../audio-downloader.js")
    const resultPromise = downloadAudio("https://www.youtube.com/watch?v=test12345", { tmpDir: os.tmpdir() })

    stream.emit("error", new Error("ytdl failed"))
    ws._triggerFinish()

    await new Promise<void>(r => setTimeout(r, 5))
    proc.emit("close", 0)

    const result = await resultPromise
    expect("audioPath" in result).toBe(true)
  })

  it("returns error when both fail", async () => {
    const stream = fakeEventEmitter()
    mockYtdlCore.mockReturnValue(stream)
    const ws = fakeWriteStream()
    mockCreateWriteStream.mockReturnValue(ws)
    mockExistsSync.mockReturnValue(false)
    mockUnlinkSync.mockImplementation(() => {})
    mockReaddirSync.mockReturnValue([])

    const proc = fakeEventEmitter() as any
    proc.stdout = fakeEventEmitter()
    proc.stderr = fakeEventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)

    const { downloadAudio } = await import("../audio-downloader.js")
    const resultPromise = downloadAudio("https://www.youtube.com/watch?v=test12345", { tmpDir: os.tmpdir() })

    stream.emit("error", new Error("ytdl failed"))
    ws._triggerFinish()

    await new Promise<void>(r => setTimeout(r, 5))
    proc.emit("close", 1)

    const result = await resultPromise
    expect("error" in result).toBe(true)
  })
})
