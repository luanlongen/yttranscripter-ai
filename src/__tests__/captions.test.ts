import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock youtube-transcript to force fallback to manual implementation
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn().mockRejectedValue(new Error("not available")) },
}))

const mockWatchHtml = (captionTracks: any[]) => `
<html><script>
var ytInitialPlayerResponse = ${JSON.stringify({
  captions: { playerCaptionsTracklistRenderer: { captionTracks } },
})};
</script></html>
`

const mockTimedtextJson = (events: any[]) => ({
  events: events.map(ev => ({ segs: [{ utf8: ev.text }] })),
})

const DEFAULT_PROXY = "http://proxy:8000"

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchCaptions", () => {
  it("returns null when video has no captions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>no player response</body></html>"),
    }))

    const { fetchCaptions } = await import("../captions.js")
    const result = await fetchCaptions("dQw4w9WgXcQ", { maxRetriesPerLanguage: 1, proxyUrl: DEFAULT_PROXY })
    expect(result).toBeNull()
  })

  it("returns caption when track is available for requested language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/watch?v=")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockWatchHtml([
            { baseUrl: "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=pt", languageCode: "pt" },
          ])),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTimedtextJson([{ text: "Olá" }, { text: "mundo" }])),
      })
    }))

    const { fetchCaptions } = await import("../captions.js")
    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt"], maxRetriesPerLanguage: 1, proxyUrl: DEFAULT_PROXY })
    expect(result).not.toBeNull()
    expect(result?.transcript).toContain("Olá")
    expect(result?.language).toBe("pt")
  })

  it("tries next language when first is not available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/watch?v=")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockWatchHtml([
            { baseUrl: "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en", languageCode: "en" },
          ])),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTimedtextJson([{ text: "Hello" }])),
      })
    }))

    const { fetchCaptions } = await import("../captions.js")
    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt", "en"], maxRetriesPerLanguage: 1, proxyUrl: DEFAULT_PROXY })
    expect(result?.language).toBe("en")
  })

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))

    const { fetchCaptions } = await import("../captions.js")
    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt"], maxRetriesPerLanguage: 1, proxyUrl: DEFAULT_PROXY })
    expect(result).toBeNull()
  })
})
