import { describe, it, expect } from "vitest"
import { extractVideoId } from "../url.js"

describe("extractVideoId", () => {
  it("extracts from watch?v= URL", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from youtu.be/ URL", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from embed URL", () => {
    expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from shorts URL", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from URL with extra params", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for invalid URL", () => {
    expect(extractVideoId("not a url")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractVideoId("")).toBeNull()
  })

  it("returns null for URL without video id", () => {
    expect(extractVideoId("https://www.youtube.com/watch")).toBeNull()
  })

  it("handles 11-char video id with dashes and underscores", () => {
    expect(extractVideoId("https://youtu.be/_-abc-_1234")).toBe("_-abc-_1234")
  })
})
