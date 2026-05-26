import { Actor } from "apify"
import ytdl from "@distube/ytdl-core"
import { spawnSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { randomUUID } from "crypto"

// Constants
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024 // 8MB chunks for OpenRouter

// Type definitions
interface ActorInput {
  youtubeUrl: string
  openRouterApiKey?: string
  openRouterModel?: string
}

interface OpenRouterUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  [key: string]: unknown
}

interface OpenRouterResponse {
  text?: string
  usage?: OpenRouterUsage
  error?: { message: string; code?: number }
}

interface TranscriptionResult {
  success: true
  youtubeUrl: string
  videoId: string
  transcript: string
  provider: "youtube-transcript" | "openrouter"
  language?: string
  usage?: OpenRouterUsage
  generatedAt: string
}

interface ErrorResult {
  success: false
  youtubeUrl: string
  error: string
  details?: string
  generatedAt: string
}

// Utilities
function log(level: "info" | "warn" | "error", msg: string): void {
  console.log(`[${level.toUpperCase()}] ${msg}`)
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/)([0-9A-Za-z_-]{11})/,
    /youtu\.be\/([0-9A-Za-z_-]{11})/,
    /embed\/([0-9A-Za-z_-]{11})/,
    /shorts\/([0-9A-Za-z_-]{11})/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

async function transcribeViaYoutubeTranscript(
  videoId: string
): Promise<{ transcript: string; language?: string } | null> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const languages = ["pt", "pt-BR", "pt-PT", "en", "en-US"]
    const maxRetries = 3
    const delayMs = 1000

    for (const lang of [...languages, undefined]) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const requestOptions = {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          }
          const options = lang
            ? { lang, requestOptions }
            : { requestOptions }
          const segments = await YoutubeTranscript.fetchTranscript(videoId, options)

          if (segments && segments.length > 0) {
            log("info", `youtube-transcript worked${lang ? ` (lang: ${lang})` : ""}`)
            return {
              transcript: (segments as Array<{ text: string }>).map((segment: any) => segment.text.trim()).join(" "),
              language: lang
            }
          }
        } catch (error) {
          if (attempt < maxRetries) {
            log("warn", `youtube-transcript attempt ${attempt}/${maxRetries} failed${lang ? ` (lang: ${lang})` : ""}`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
          } else {
            log("warn", `youtube-transcript failed after all attempts${lang ? ` (lang: ${lang})` : ""}`)
          }
        }
      }
    }
  } catch (error) {
    log("warn", "youtube-transcript not available; falling back to audio")
  }

  return null
}

function createTempFile(): { base: string; audioPath: string } {
  const filename = `yt-transcribe-${Date.now()}-${randomUUID()}`
  const base = path.join(os.tmpdir(), filename)
  return {
    base,
    audioPath: `${base}.mp3`
  }
}

function downloadAudioViaYtdlp(url: string, audioPath: string): boolean {
  log("info", "Trying yt-dlp fallback...")

  const args = [
    "-m", "yt_dlp",
    "-f", "bestaudio/best",
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "64K",
    "-o", `${audioPath.replace(".mp3", "")}.%(ext)s`,
    "--no-playlist",
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=android,web_creator,ios",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    url
  ]

  const result = spawnSync("python3", args, { encoding: "utf-8", stdio: "pipe" })
  if (result.status !== 0) {
    log("error", `yt-dlp failed: ${result.stderr}`)
    return false
  }
  return fs.existsSync(audioPath)
}

async function downloadAudio(url: string): Promise<{ audioPath: string } | { error: string; details?: string }> {
  const { base, audioPath } = createTempFile()

  log("info", "Downloading audio from video...")

  // Try @distube/ytdl-core first
  const downloaded = await new Promise<boolean>(resolve => {
    const stream = ytdl(url, {
      filter: "audioonly",
      quality: "lowestaudio",
      requestOptions: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      }
    })

    const writeStream = fs.createWriteStream(audioPath)
    stream.pipe(writeStream)

    let streamError: string | null = null

    stream.on("error", (err: Error) => {
      streamError = err.message
    })

    writeStream.on("finish", () => {
      if (streamError) {
        log("warn", `ytdl-core failed: ${streamError}`)
        resolve(false)
        return
      }
      resolve(fs.existsSync(audioPath))
    })

    writeStream.on("error", (err: Error) => {
      log("warn", `ytdl-core write error: ${err.message}`)
      resolve(false)
    })
  })

  // Fallback to yt-dlp if ytdl-core failed
  if (!downloaded) {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
    const ytDlpOk = downloadAudioViaYtdlp(url, audioPath)
    if (!ytDlpOk) {
      return { error: "Failed to download audio", details: "ytdl-core and yt-dlp both failed" }
    }
  }

  const sizeMB = fs.statSync(audioPath).size / (1024 * 1024)
  log("info", `Audio downloaded: ${sizeMB.toFixed(1)} MB`)
  return { audioPath }
}

async function callOpenRouter(
  audioBytes: Buffer,
  apiKey: string,
  model: string,
  part = 0,
  total = 1,
  language = "pt"
): Promise<{ transcript: string; usage?: OpenRouterUsage } | null> {
  const suffix = total > 1 ? ` (part ${part}/${total})` : ""
  log("info", `Transcribing via OpenRouter (${model})${suffix}...`)

  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input_audio: {
        data: audioBytes.toString("base64"),
        format: "mp3"
      },
      language
    }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const body = await response.text()
    log("error", `HTTP ${response.status}: ${body}`)
    return null
  }

  const data = (await response.json()) as OpenRouterResponse

  if (data.error) {
    log("error", `OpenRouter: ${data.error.message}`)
    return null
  }

  const transcript = data.text?.trim()
  if (!transcript) {
    return null
  }

  return {
    transcript,
    usage: data.usage
  }
}

async function transcribeViaOpenRouter(
  audioPath: string,
  apiKey: string,
  model: string,
  language = "pt"
): Promise<{ transcript: string; usage?: OpenRouterUsage } | null> {
  const audioBytes = fs.readFileSync(audioPath)

  // If audio is small enough, send directly
  if (audioBytes.length <= CHUNK_SIZE_BYTES) {
    return await callOpenRouter(audioBytes, apiKey, model, 0, 1, language)
  }

  // Split large audio into chunks
  const totalChunks = Math.ceil(audioBytes.length / CHUNK_SIZE_BYTES)
  log(
    "info",
    `Large audio (${(audioBytes.length / 1024 / 1024).toFixed(1)} MB) — splitting into ${totalChunks} parts...`
  )

  const parts: string[] = []
  let usage: OpenRouterUsage | undefined

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES
    const end = Math.min(start + CHUNK_SIZE_BYTES, audioBytes.length)
    const chunk = audioBytes.subarray(start, end)
    const result = await callOpenRouter(chunk, apiKey, model, i + 1, totalChunks, language)

    if (result) {
      parts.push(result.transcript)
      usage = result.usage
    } else {
      log("warn", `Part ${i + 1} failed, skipping...`)
    }
  }

  return parts.length > 0 ? { transcript: parts.join(" "), usage } : null
}

async function transcribeYoutubeUrl(
  url: string,
  openRouterApiKey?: string,
  openRouterModel = "openai/whisper-large-v3",
  language = "pt"
): Promise<TranscriptionResult | ErrorResult> {
  const videoId = extractVideoId(url)

  if (!videoId) {
    return {
      success: false,
      youtubeUrl: url,
      error: `Invalid URL or video ID not found: ${url}`,
      generatedAt: new Date().toISOString()
    }
  }

  log("info", `Video ID: ${videoId}`)
  log("info", "Searching for transcript via YouTube captions...")

  // Try youtube-transcript first
  const ytResult = await transcribeViaYoutubeTranscript(videoId)
  if (ytResult) {
    return {
      success: true,
      youtubeUrl: url,
      videoId,
      transcript: ytResult.transcript,
      provider: "youtube-transcript",
      language: ytResult.language,
      generatedAt: new Date().toISOString()
    }
  }

  // Fallback to OpenRouter
  if (!openRouterApiKey) {
    return {
      success: false,
      youtubeUrl: url,
      error: "YouTube captions not available and openRouterApiKey not provided",
      details: "Please provide openRouterApiKey to transcribe via audio",
      generatedAt: new Date().toISOString()
    }
  }

  log("info", "Captions not available. Downloading audio for OpenRouter...")

  const downloadResult = await downloadAudio(url)
  if ("error" in downloadResult) {
    return {
      success: false,
      youtubeUrl: url,
      error: downloadResult.error,
      details: downloadResult.details,
      generatedAt: new Date().toISOString()
    }
  }

  try {
    const orResult = await transcribeViaOpenRouter(
      downloadResult.audioPath,
      openRouterApiKey,
      openRouterModel,
      language
    )

    if (!orResult) {
      return {
        success: false,
        youtubeUrl: url,
        error: "Could not transcribe video via any method",
        generatedAt: new Date().toISOString()
      }
    }

    return {
      success: true,
      youtubeUrl: url,
      videoId,
      transcript: orResult.transcript,
      provider: "openrouter",
      usage: orResult.usage,
      generatedAt: new Date().toISOString()
    }
  } finally {
    try {
      fs.unlinkSync(downloadResult.audioPath)
    } catch {
      // ignore cleanup failures
    }
  }
}

async function main() {
  await Actor.init()

  try {
    const input = await Actor.getInput<ActorInput>()

    if (!input) {
      throw new Error("No input provided")
    }

    const { youtubeUrl, openRouterApiKey, openRouterModel = "openai/whisper-large-v3" } = input

    // Validate URL
    if (!youtubeUrl || typeof youtubeUrl !== "string") {
      throw new Error("Invalid youtubeUrl - must be a non-empty string")
    }

    log("info", `Starting YouTube transcription for: ${youtubeUrl}`)

    const result = await transcribeYoutubeUrl(youtubeUrl, openRouterApiKey, openRouterModel)

    await Actor.setValue("OUTPUT", result)
    await Actor.pushData(result)

    if (result.success) {
      log("info", `Transcription completed via ${result.provider}`)

      // Charge for the transcription event
      const chargeResult = await Actor.charge({ eventName: "transcription-completed" })

      if (chargeResult.eventChargeLimitReached) {
        log("warn", "User's spending limit reached. Exiting gracefully.")
        await Actor.exit()
        return
      }

      log("info", "Charged for transcription-completed event")
    } else {
      log("error", `Transcription failed: ${result.error}`)
      process.exit(1)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log("error", `Execution failed: ${errorMsg}`)

    const output: ErrorResult = {
      success: false,
      youtubeUrl: "unknown",
      error: errorMsg,
      generatedAt: new Date().toISOString()
    }

    try {
      const input = await Actor.getInput<ActorInput>()
      if (input?.youtubeUrl) {
        output.youtubeUrl = input.youtubeUrl
      }
    } catch {
      // ignore
    }

    await Actor.setValue("OUTPUT", output)
    await Actor.pushData(output)

    process.exit(1)
  }

  await Actor.exit()
}

main().catch(error => {
  console.error("Unhandled error:", error)
  process.exit(1)
})
