import ytdl from "@distube/ytdl-core"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { log } from "./logging.js"

export interface DownloadOptions {
  tmpDir: string
  userAgent?: string
  ytDlpPath?: string
  ytDlpTimeoutMs?: number
  proxyUrl?: string
}

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
const YTDLP_TIMEOUT_MS = 10 * 60 * 1000

type DownloadResult = { audioPath: string } | { error: string; details?: string }

function spawnAsync(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: "pipe" })
    let stderr = ""
    proc.stderr?.on("data", chunk => { stderr += chunk.toString() })
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM")
      reject(new Error(`yt-dlp timeout após ${timeoutMs}ms`))
    }, timeoutMs)
    proc.on("close", code => {
      clearTimeout(timeoutId)
      resolve({ code: code ?? 1, stderr })
    })
    proc.on("error", err => {
      clearTimeout(timeoutId)
      reject(err)
    })
  })
}

async function downloadViaYtdlCore(url: string, audioPath: string, userAgent: string, timeoutMs = 120000): Promise<boolean> {
  const downloadPromise = new Promise<boolean>(resolve => {
    const stream = ytdl(url, {
      filter: "audioonly",
      quality: "lowestaudio",
      requestOptions: { headers: { "User-Agent": userAgent } },
    })
    const writeStream = fs.createWriteStream(audioPath)
    let streamError: string | null = null

    stream.on("error", (err: Error) => { streamError = err.message })
    stream.pipe(writeStream)

    writeStream.on("finish", () => {
      if (streamError) {
        log("warn", `ytdl-core falhou: ${streamError}`)
        resolve(false)
        return
      }
      resolve(fs.existsSync(audioPath))
    })
    writeStream.on("error", (err: Error) => {
      log("warn", `ytdl-core erro de escrita: ${err.message}`)
      resolve(false)
    })
  })

  const timeoutPromise = new Promise<boolean>(resolve => {
    setTimeout(() => {
      log("warn", `ytdl-core timeout após ${timeoutMs}ms`)
      resolve(false)
    }, timeoutMs)
  })

  return Promise.race([downloadPromise, timeoutPromise])
}

async function downloadViaYtdlp(
  url: string,
  base: string,
  audioPath: string,
  userAgent: string,
  ytDlpPath: string,
  timeoutMs: number,
  proxyUrl?: string
): Promise<boolean> {
  const args = [
    "-m", "yt_dlp",
    "-f", "bestaudio/best",
    "--extract-audio", "--audio-format", "mp3", "--audio-quality", "64K",
    "-o", `${base}.%(ext)s`,
    "--no-playlist",
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=android,web_creator,ios",
    "--user-agent", userAgent,
  ]
  if (proxyUrl) args.push("--proxy", proxyUrl)
  args.push(url)
  try {
    const { code, stderr } = await spawnAsync(ytDlpPath, args, timeoutMs)
    if (code !== 0) {
      log("error", `yt-dlp exit ${code}: ${stderr}`)
      return false
    }
  } catch (err) {
    log("error", `yt-dlp falhou: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
  if (fs.existsSync(audioPath)) return true
  const dir = path.dirname(audioPath)
  const baseName = path.basename(base)
  const files = fs.readdirSync(dir).filter(f => f.startsWith(baseName) && f.endsWith(".mp3"))
  if (files.length === 0) return false
  if (files.length === 1 && path.join(dir, files[0]) !== audioPath) {
    fs.renameSync(path.join(dir, files[0]), audioPath)
  }
  return fs.existsSync(audioPath)
}

export async function downloadAudio(url: string, opts: DownloadOptions): Promise<DownloadResult> {
  const userAgent = opts.userAgent ?? DEFAULT_UA
  const ytDlpPath = opts.ytDlpPath ?? "python3"
  const timeoutMs = opts.ytDlpTimeoutMs ?? YTDLP_TIMEOUT_MS
  const base = path.join(opts.tmpDir, `yt-transcribe-${Date.now()}-${randomUUID()}`)
  const audioPath = `${base}.mp3`

  log("info", "Baixando áudio do vídeo...")
  const downloaded = await downloadViaYtdlCore(url, audioPath, userAgent)

  if (!downloaded) {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
    log("info", "Tentando fallback yt-dlp...")
    const ytDlpOk = await downloadViaYtdlp(url, base, audioPath, userAgent, ytDlpPath, timeoutMs, opts.proxyUrl)
    if (!ytDlpOk) {
      return { error: "Failed to download audio", details: "ytdl-core and yt-dlp both failed" }
    }
  }

  const sizeMB = fs.statSync(audioPath).size / (1024 * 1024)
  log("info", `Áudio baixado: ${sizeMB.toFixed(1)} MB`)
  return { audioPath }
}
