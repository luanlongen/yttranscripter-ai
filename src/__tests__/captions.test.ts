import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchCaptions } from "../captions.js"

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

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchCaptions", () => {
  it("returns null when video has no captions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>no player response</body></html>"),
    }))

    const result = await fetchCaptions("dQw4w9WgXcQ", {})
    expect(result).toBeNull()
  })

  it("returns caption when track is available for requested language", async () => {
    let fetchCallCount = 0
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      fetchCallCount++
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

    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt"] })
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

    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt", "en"] })
    expect(result?.language).toBe("en")
  })

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))
    const result = await fetchCaptions("dQw4w9WgXcQ", { languages: ["pt"], maxRetriesPerLanguage: 1 })
    expect(result).toBeNull()
  })
})
