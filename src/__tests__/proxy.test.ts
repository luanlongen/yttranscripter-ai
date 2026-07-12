import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("apify", () => ({
  Actor: {
    createProxyConfiguration: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getResidentialProxyUrl", () => {
  it("returns proxy URL when createProxyConfiguration succeeds", async () => {
    const { Actor } = await import("apify")
    ;(Actor.createProxyConfiguration as any).mockResolvedValue({
      newUrl: async () => "http://user:pass@proxy.apify.com:8000",
    })

    const { getResidentialProxyUrl } = await import("../proxy.js")
    const result = await getResidentialProxyUrl()
    expect(result).toBe("http://user:pass@proxy.apify.com:8000")
  })

  it("returns null when createProxyConfiguration fails", async () => {
    const { Actor } = await import("apify")
    ;(Actor.createProxyConfiguration as any).mockRejectedValue(new Error("proxy not enabled"))

    const { getResidentialProxyUrl } = await import("../proxy.js")
    const result = await getResidentialProxyUrl()
    expect(result).toBeNull()
  })
})
