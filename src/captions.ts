import { ProxyAgent, setGlobalDispatcher } from "undici"
import { log } from "./logging.js"

export interface CaptionResult {
  transcript: string
  language?: string
}

export interface FetchCaptionsOptions {
  languages?: string[]
  proxyUrl?: string
  maxRetriesPerLanguage?: number
  retryDelayMs?: number
}

const DEFAULT_LANGUAGES = ["pt", "pt-BR", "pt-PT", "en", "en-US"]
const DEFAULT_RETRIES = 3
const DEFAULT_DELAY_MS = 1000
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
  name?: { simpleText?: string }
}

async function fetchWithProxy(url: string, proxyUrl?: string, init?: RequestInit): Promise<Response> {
  if (proxyUrl) {
    const agent = new ProxyAgent({ uri: proxyUrl })
    setGlobalDispatcher(agent)
  }
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": DEFAULT_UA,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      ...(init?.headers ?? {}),
    },
  })
}

function extractPlayerResponse(html: string): any | null {
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

async function fetchCaptionTracks(videoId: string, proxyUrl?: string): Promise<CaptionTrack[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const response = await fetchWithProxy(watchUrl, proxyUrl)
  if (!response.ok) {
    log("warn", `youtube.com/watch returned HTTP ${response.status}`)
    return []
  }
  const html = await response.text()
  const playerResponse = extractPlayerResponse(html)
  if (!playerResponse) {
    log("warn", `ytInitialPlayerResponse não encontrado no HTML de ${videoId}`)
    return []
  }
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return Array.isArray(tracks) ? tracks : []
}

function selectTrack(tracks: CaptionTrack[], languages: string[]): { track: CaptionTrack; lang: string } | null {
  for (const lang of languages) {
    const exact = tracks.find(t => t.languageCode === lang && t.kind !== "asr")
    if (exact) return { track: exact, lang }
  }
  for (const lang of languages) {
    const partial = tracks.find(t => t.languageCode.startsWith(lang) && t.kind !== "asr")
    if (partial) return { track: partial, lang: partial.languageCode }
  }
  for (const lang of languages) {
    const asr = tracks.find(t => t.languageCode.startsWith(lang))
    if (asr) return { track: asr, lang: asr.languageCode }
  }
  return null
}

async function downloadTrack(track: CaptionTrack, proxyUrl?: string): Promise<string> {
  const url = `${track.baseUrl}&fmt=json3`
  const response = await fetchWithProxy(url, proxyUrl)
  if (!response.ok) {
    throw new Error(`timedtext HTTP ${response.status}`)
  }
  const data = await response.json() as { events?: Array<{ segs?: Array<{ utf8?: string }> }> }
  if (!data.events) return ""
  return data.events
    .filter(ev => ev.segs)
    .map(ev => ev.segs!.map(s => s.utf8 ?? "").join(""))
    .join(" ")
    .trim()
}

export async function fetchCaptions(
  videoId: string,
  opts: FetchCaptionsOptions = {}
): Promise<CaptionResult | null> {
  const languages = opts.languages ?? DEFAULT_LANGUAGES
  const proxyUrl = opts.proxyUrl
  const maxRetries = opts.maxRetriesPerLanguage ?? DEFAULT_RETRIES
  const retryDelay = opts.retryDelayMs ?? DEFAULT_DELAY_MS

  // Se proxy foi fornecido, configurar dispatcher global ANTES de qualquer fetch
  // Isso faz o youtube-transcript (e qualquer outro fetch) usar o proxy
  if (proxyUrl) {
    const agent = new ProxyAgent({ uri: proxyUrl })
    setGlobalDispatcher(agent)
    log("info", "Proxy configurado globalmente para requests")
  }

  // Tentar youtube-transcript (npm package) - vai usar proxy se configurado
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    for (const lang of [...languages, undefined]) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const options = lang
            ? { lang, requestOptions: { headers: { "User-Agent": DEFAULT_UA } } }
            : { requestOptions: { headers: { "User-Agent": DEFAULT_UA } } }
          const segments = await YoutubeTranscript.fetchTranscript(videoId, options)
          if (segments && segments.length > 0) {
            const transcript = (segments as Array<{ text: string }>).map(s => s.text.trim()).join(" ")
            log("info", `youtube-transcript funcionou${lang ? ` (idioma: ${lang})` : ""}`)
            return { transcript, language: lang }
          }
        } catch {
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelay))
        }
      }
    }
  } catch {
    log("warn", "youtube-transcript package não disponível")
  }

  // Se youtube-transcript falhou E tem proxy, tentar fetch manual do timedtext
  if (!proxyUrl) return null

  log("info", "Tentando fetch manual do timedtext com proxy...")
  let tracks: CaptionTrack[] = []
  let lastError = ""

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      tracks = await fetchCaptionTracks(videoId, proxyUrl)
      if (tracks.length > 0) break
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelay))
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      log("warn", `fetchCaptionTracks tentativa ${attempt}/${maxRetries} falhou: ${lastError}`)
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelay))
    }
  }

  if (tracks.length === 0) {
    log("info", "Nenhuma track de legenda disponível")
    return null
  }

  const selected = selectTrack(tracks, languages)
  if (!selected) {
    log("info", `Nenhuma track para os idiomas solicitados: ${languages.join(", ")}`)
    return null
  }

  try {
    const transcript = await downloadTrack(selected.track, proxyUrl)
    if (!transcript) return null
    log("info", `Legenda obtida via fetch manual (idioma: ${selected.lang})`)
    return { transcript, language: selected.lang }
  } catch (err) {
    log("warn", `downloadTrack falhou: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
