import * as os from "os"
import * as fs from "fs"
import { extractVideoId } from "./url.js"
import { fetchCaptions } from "./captions.js"
import { downloadAudio } from "./audio-downloader.js"
import { splitAudioByTime } from "./audio-chunker.js"
import { transcribeAudioChunks } from "./whisper.js"
import { log } from "./logging.js"
import type { TranscriptionResult, ErrorResult, TranscriptionOutcome, OpenRouterUsage } from "./types.js"

export interface TranscriberConfig {
  openRouterApiKey?: string
  openRouterModel?: string
  language?: string
  segmentMinutes?: number
  proxyUrl?: string
}

const DEFAULT_LANGUAGES = ["pt", "pt-BR", "pt-PT", "en", "en-US"]
const DEFAULT_SEGMENT_MINUTES = 5
const DEFAULT_MODEL = "openai/whisper-large-v3"

function cleanupFiles(files: string[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch {
      // intentional
    }
  }
}

function buildLanguageList(primary?: string): string[] {
  if (!primary) return DEFAULT_LANGUAGES
  return [primary, ...DEFAULT_LANGUAGES.filter(l => l !== primary)]
}

export async function transcribeYoutubeUrl(
  url: string,
  config: TranscriberConfig
): Promise<TranscriptionOutcome> {
  const videoId = extractVideoId(url)
  if (!videoId) {
    return {
      success: false,
      youtubeUrl: url,
      error: "Invalid URL or video ID not found",
      generatedAt: new Date().toISOString(),
    } satisfies ErrorResult
  }

  log("info", `Vídeo ID: ${videoId}`)
  log("info", "Buscando transcrição via legendas do YouTube...")

  const languages = buildLanguageList(config.language)
  const captions = await fetchCaptions(videoId, {
    languages,
    proxyUrl: config.proxyUrl,
  })

  if (captions) {
    log("info", "Legenda encontrada, retornando...")
    return {
      success: true,
      youtubeUrl: url,
      videoId,
      transcript: captions.transcript,
      provider: "youtube-transcript",
      language: captions.language,
      generatedAt: new Date().toISOString(),
    } satisfies TranscriptionResult
  }

  if (!config.openRouterApiKey) {
    return {
      success: false,
      youtubeUrl: url,
      error: "YouTube captions not available and openRouterApiKey not provided",
      generatedAt: new Date().toISOString(),
    } satisfies ErrorResult
  }

  log("info", "Legendas não disponíveis. Baixando áudio para OpenRouter...")

  const download = await downloadAudio(url, { tmpDir: os.tmpdir(), proxyUrl: config.proxyUrl })
  if ("error" in download) {
    return {
      success: false,
      youtubeUrl: url,
      error: download.error,
      details: download.details,
      generatedAt: new Date().toISOString(),
    } satisfies ErrorResult
  }

  const tmpFiles = [download.audioPath]

  try {
    const chunks = await splitAudioByTime(download.audioPath, config.segmentMinutes ?? DEFAULT_SEGMENT_MINUTES)
    if (chunks.length > 1 || chunks[0] !== download.audioPath) {
      tmpFiles.push(...chunks)
    }

    const result = await transcribeAudioChunks(chunks, {
      apiKey: config.openRouterApiKey,
      model: config.openRouterModel ?? DEFAULT_MODEL,
      language: config.language ?? "pt",
    })

    if (!result) {
      return {
        success: false,
        youtubeUrl: url,
        error: "Could not transcribe video via any method",
        generatedAt: new Date().toISOString(),
      } satisfies ErrorResult
    }

    return {
      success: true,
      youtubeUrl: url,
      videoId,
      transcript: result.transcript,
      provider: "openrouter",
      usage: result.usage,
      generatedAt: new Date().toISOString(),
    } satisfies TranscriptionResult
  } finally {
    cleanupFiles(tmpFiles)
  }
}
