import { describe, it, expect, vi, beforeEach } from "vitest"

const mockExistsSync = vi.fn()
const mockUnlinkSync = vi.fn()

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
}))

vi.mock("../captions.js", () => ({
  fetchCaptions: vi.fn(),
}))
vi.mock("../audio-downloader.js", () => ({
  downloadAudio: vi.fn(),
}))
vi.mock("../audio-chunker.js", () => ({
  splitAudioByTime: vi.fn(),
}))
vi.mock("../whisper.js", () => ({
  transcribeAudioChunks: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("transcribeYoutubeUrl", () => {
  it("returns youtube-transcript result when captions available, no audio download", async () => {
    const { fetchCaptions } = await import("../captions.js")
    const { downloadAudio } = await import("../audio-downloader.js")
    ;(fetchCaptions as any).mockResolvedValue({
      transcript: "hello world",
      language: "pt",
    })
    ;(downloadAudio as any).mockResolvedValue({ audioPath: "/tmp/audio.mp3" })

    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    const result = await transcribeYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {})

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.provider).toBe("youtube-transcript")
      expect(result.transcript).toBe("hello world")
    }
    expect(downloadAudio).not.toHaveBeenCalled()
  })

  it("uses OpenRouter when captions unavailable and apiKey provided", async () => {
    const { fetchCaptions } = await import("../captions.js")
    const { downloadAudio } = await import("../audio-downloader.js")
    const { splitAudioByTime } = await import("../audio-chunker.js")
    const { transcribeAudioChunks } = await import("../whisper.js")
    ;(fetchCaptions as any).mockResolvedValue(null)
    ;(downloadAudio as any).mockResolvedValue({ audioPath: "/tmp/audio.mp3" })
    ;(splitAudioByTime as any).mockResolvedValue(["/tmp/audio.mp3"])
    ;(transcribeAudioChunks as any).mockResolvedValue({
      transcript: "whispered text",
      usage: { total_tokens: 100 },
    })
    mockExistsSync.mockReturnValue(false)
    mockUnlinkSync.mockImplementation(() => {})

    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    const result = await transcribeYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      openRouterApiKey: "sk-or-test",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.provider).toBe("openrouter")
      expect(result.transcript).toBe("whispered text")
    }
  })

  it("returns error when captions unavailable and no apiKey", async () => {
    const { fetchCaptions } = await import("../captions.js")
    ;(fetchCaptions as any).mockResolvedValue(null)

    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    const result = await transcribeYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("openRouterApiKey")
    }
  })

  it("returns error when URL is invalid", async () => {
    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    const result = await transcribeYoutubeUrl("invalid-url", {})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Invalid URL")
    }
  })

  it("cleans up temp files even when Whisper fails", async () => {
    const { fetchCaptions } = await import("../captions.js")
    const { downloadAudio } = await import("../audio-downloader.js")
    const { splitAudioByTime } = await import("../audio-chunker.js")
    const { transcribeAudioChunks } = await import("../whisper.js")
    ;(fetchCaptions as any).mockResolvedValue(null)
    ;(downloadAudio as any).mockResolvedValue({ audioPath: "/tmp/audio.mp3" })
    ;(splitAudioByTime as any).mockResolvedValue(["/tmp/audio.mp3"])
    ;(transcribeAudioChunks as any).mockResolvedValue(null)
    mockExistsSync.mockReturnValue(true)
    mockUnlinkSync.mockImplementation(() => {})

    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    await transcribeYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      openRouterApiKey: "sk-or-test",
    })

    expect(mockUnlinkSync).toHaveBeenCalled()
  })

  it("passes proxyUrl only to fetchCaptions", async () => {
    const { fetchCaptions } = await import("../captions.js")
    const { downloadAudio } = await import("../audio-downloader.js")
    ;(fetchCaptions as any).mockResolvedValue({
      transcript: "hello",
      language: "pt",
    })
    ;(downloadAudio as any).mockResolvedValue({ audioPath: "/tmp/x.mp3" })

    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    await transcribeYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      proxyUrl: "http://proxy:8000",
    })

    expect(fetchCaptions).toHaveBeenCalledWith(
      "dQw4w9WgXcQ",
      expect.objectContaining({ proxyUrl: "http://proxy:8000" })
    )
  })
})
