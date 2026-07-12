import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("apify", () => ({
  Actor: {
    init: vi.fn().mockResolvedValue(undefined),
    getInput: vi.fn(),
    setValue: vi.fn().mockResolvedValue(undefined),
    pushData: vi.fn().mockResolvedValue(undefined),
    charge: vi.fn().mockResolvedValue({ eventChargeLimitReached: false }),
    exit: vi.fn().mockResolvedValue(undefined),
    main: vi.fn((fn: () => Promise<void>) => fn()),
  },
}))

vi.mock("../transcriber.js", () => ({
  transcribeYoutubeUrl: vi.fn(),
}))
vi.mock("../proxy.js", () => ({
  getResidentialProxyUrl: vi.fn(),
}))
vi.mock("../logging.js", () => ({
  log: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("main", () => {
  it("calls transcriber and returns success when transcription succeeds", async () => {
    const { Actor } = await import("apify")
    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    ;(Actor.getInput as any).mockResolvedValue({
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      openRouterApiKey: "sk-or-test",
    })
    ;(transcribeYoutubeUrl as any).mockResolvedValue({
      success: true,
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      videoId: "test12345",
      transcript: "Hello",
      provider: "youtube-transcript",
      generatedAt: new Date().toISOString(),
    })

    vi.resetModules()
    await import("../main.js")

    expect(transcribeYoutubeUrl).toHaveBeenCalled()
    expect(Actor.setValue).toHaveBeenCalledWith("OUTPUT", expect.any(Object))
    expect(Actor.pushData).toHaveBeenCalled()
    expect(Actor.charge).toHaveBeenCalledWith({ eventName: "transcription-completed" })
  })

  it("calls getResidentialProxyUrl when useProxy is true", async () => {
    const { Actor } = await import("apify")
    const { getResidentialProxyUrl } = await import("../proxy.js")
    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    ;(Actor.getInput as any).mockResolvedValue({
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      useProxy: true,
    })
    ;(getResidentialProxyUrl as any).mockResolvedValue("http://proxy:8000")
    ;(transcribeYoutubeUrl as any).mockResolvedValue({
      success: true,
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      videoId: "test12345",
      transcript: "Hello",
      provider: "youtube-transcript",
      generatedAt: new Date().toISOString(),
    })

    vi.resetModules()
    await import("../main.js")

    expect(getResidentialProxyUrl).toHaveBeenCalled()
    expect(transcribeYoutubeUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ proxyUrl: "http://proxy:8000" })
    )
  })

  it("does not call getResidentialProxyUrl when useProxy is false", async () => {
    const { Actor } = await import("apify")
    const { getResidentialProxyUrl } = await import("../proxy.js")
    const { transcribeYoutubeUrl } = await import("../transcriber.js")
    ;(Actor.getInput as any).mockResolvedValue({
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      useProxy: false,
    })
    ;(transcribeYoutubeUrl as any).mockResolvedValue({
      success: true,
      youtubeUrl: "https://www.youtube.com/watch?v=test12345",
      videoId: "test12345",
      transcript: "Hello",
      provider: "youtube-transcript",
      generatedAt: new Date().toISOString(),
    })

    vi.resetModules()
    await import("../main.js")

    expect(getResidentialProxyUrl).not.toHaveBeenCalled()
  })
})
