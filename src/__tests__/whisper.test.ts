import { describe, it, expect, vi, beforeEach } from "vitest"

const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock("fs", () => ({
  readFileSync: mockReadFileSync,
}))

beforeEach(() => {
  mockReadFileSync.mockReturnValue(Buffer.from("audio"))
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("transcribeAudioChunks", () => {
  it("returns transcript for single chunk success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "Hello world" }),
    }))

    const { transcribeAudioChunks } = await import("../whisper.js")
    const result = await transcribeAudioChunks(["/tmp/test.mp3"], {
      apiKey: "sk-or-test",
      model: "openai/whisper-large-v3",
      language: "pt",
    })

    expect(result).not.toBeNull()
    expect(result?.transcript).toBe("Hello world")
  })

  it("concatenates multiple chunks in order", async () => {
    let callCount = 0
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => {
        callCount++
        return Promise.resolve({ text: `chunk${callCount}` })
      },
    }))

    const { transcribeAudioChunks } = await import("../whisper.js")
    const result = await transcribeAudioChunks(["/tmp/1.mp3", "/tmp/2.mp3"], {
      apiKey: "sk-or-test",
      model: "m",
      language: "pt",
    })

    expect(result?.transcript).toBe("chunk1 chunk2")
  })

  it("returns null when all chunks fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
    }))

    const { transcribeAudioChunks } = await import("../whisper.js")
    const result = await transcribeAudioChunks(["/tmp/test.mp3"], {
      apiKey: "sk-or-test",
      model: "m",
      language: "pt",
      maxRetriesPerChunk: 0,
    })

    expect(result).toBeNull()
  })

  it("skips failed chunk and continues with others", async () => {
    let callNum = 0
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callNum++
      if (callNum === 1) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("err") })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: "success" }) })
    }))

    const { transcribeAudioChunks } = await import("../whisper.js")
    const result = await transcribeAudioChunks(["/tmp/1.mp3", "/tmp/2.mp3"], {
      apiKey: "k",
      model: "m",
      language: "pt",
      maxRetriesPerChunk: 0,
    })

    expect(result).not.toBeNull()
    expect(result?.transcript).toBe("success")
  })
})
