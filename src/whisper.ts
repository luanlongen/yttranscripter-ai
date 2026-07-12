import * as fs from "fs"
import { log, maskKey } from "./logging.js"
import type { OpenRouterResponse, OpenRouterUsage } from "./types.js"

export interface WhisperOptions {
  apiKey: string
  model: string
  language: string
  maxRetriesPerChunk?: number
  timeoutMs?: number
}

const DEFAULT_RETRIES = 2
const DEFAULT_TIMEOUT_MS = 120_000
const BACKOFF_BASE_MS = 2000
const BACKOFF_CAP_MS = 30000

type WhisperResult = { transcript: string; usage?: OpenRouterUsage } | null

async function callOpenRouter(
  audioBytes: Buffer,
  opts: WhisperOptions,
  part: number,
  total: number
): Promise<WhisperResult> {
  const suffix = total > 1 ? ` (parte ${part}/${total})` : ""
  log("info", `Transcrevendo via OpenRouter (${opts.model})${suffix}...`)

  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input_audio: { data: audioBytes.toString("base64"), format: "mp3" },
      language: opts.language,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text()
    log("error", `OpenRouter HTTP ${response.status}: ${body}`)
    return null
  }

  const data = (await response.json()) as OpenRouterResponse
  if (data.error) {
    log("error", `OpenRouter: ${data.error.message}`)
    return null
  }
  const transcript = data.text?.trim()
  if (!transcript) return null
  return { transcript, usage: data.usage }
}

export async function transcribeAudioChunks(
  chunkPaths: string[],
  opts: WhisperOptions
): Promise<WhisperResult> {
  const maxRetries = opts.maxRetriesPerChunk ?? DEFAULT_RETRIES
  const parts: string[] = []
  let lastUsage: OpenRouterUsage | undefined

  for (let i = 0; i < chunkPaths.length; i++) {
    const chunkPath = chunkPaths[i]
    let chunkResult: WhisperResult = null
    let attempt = 0

    while (attempt <= maxRetries && !chunkResult) {
      try {
        const audioBytes = fs.readFileSync(chunkPath)
        chunkResult = await callOpenRouter(audioBytes, opts, i + 1, chunkPaths.length)
      } catch (err) {
        log("warn", `Chunk ${i + 1} tentativa ${attempt + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!chunkResult && attempt < maxRetries) {
        const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS)
        log("warn", `Chunk ${i + 1} falhou, aguardando ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
      }
      attempt++
    }

    if (chunkResult) {
      parts.push(chunkResult.transcript)
      lastUsage = chunkResult.usage
    } else {
      log("warn", `Chunk ${i + 1} falhou após ${maxRetries + 1} tentativas, pulando...`)
    }
  }

  if (parts.length === 0) {
    log("error", `Todos os chunks falharam (total: ${chunkPaths.length}, key: ${maskKey(opts.apiKey)})`)
    return null
  }

  return { transcript: parts.join(" "), usage: lastUsage }
}
