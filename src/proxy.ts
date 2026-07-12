import { Actor } from "apify"
import { log } from "./logging.js"

export async function getResidentialProxyUrl(): Promise<string | null> {
  try {
    const proxyConfig = await Actor.createProxyConfiguration({ groups: ["RESIDENTIAL"] })
    if (!proxyConfig) return null
    const proxyUrl = await proxyConfig.newUrl()
    return typeof proxyUrl === "string" ? proxyUrl : null
  } catch (error) {
    log("warn", `Proxy residencial indisponível: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
