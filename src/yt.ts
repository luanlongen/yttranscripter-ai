#!/usr/bin/env node
import "dotenv/config"
/**
 * HTTP server for YouTube transcription.
 *
 * POST /transcribe
 * Headers:
 *   Authorization: Bearer <server key>
 * Body:
 *   { "url": "https://www.youtube.com/watch?v=..." }
 *
 * Response:
 *   JSON with the transcription. If `download=true` is passed in the query
 *   string, the response is returned as a downloadable .json file.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { randomUUID } from "crypto"
import { spawnSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const PORT = Number(process.env.PORT ?? 6969)
const AUTH_BEARER_KEY = process.env.AUTH_BEARER_KEY?.trim() ?? ""
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() ?? ""
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || "openai/whisper-large-v3"
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024

interface OpenRouterResponse {
  text?: string
  usage?: OpenRouterUsage
  error?: { message: string; code?: number }
}

interface OpenRouterUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  cached_tokens?: number
  [key: string]: unknown
}

interface TranscriptionResult {
  ok: true
  videoId: string
  sourceUrl: string
  provider: "youtube-transcript" | "openrouter"
  method: "youtube-transcript" | "openrouter"
  transcript: string
  language?: string
  usage?: OpenRouterUsage
  generatedAt: string
}

interface ErrorResult {
  ok: false
  error: string
  details?: string
}

function log(nivel: "info" | "aviso" | "erro", msg: string): void {
  console.log(`[${nivel}] ${msg}`)
}

function extrairVideoId(url: string): string | null {
  const padroes = [
    /(?:v=|\/)([0-9A-Za-z_-]{11})/,
    /youtu\.be\/([0-9A-Za-z_-]{11})/,
    /embed\/([0-9A-Za-z_-]{11})/,
    /shorts\/([0-9A-Za-z_-]{11})/
  ]

  for (const padrao of padroes) {
    const match = url.match(padrao)
    if (match) return match[1]
  }

  return null
}

function jsonResponse(
  res: ServerResponse,
  statusCode: number,
  payload: TranscriptionResult | ErrorResult,
  downloadFilename?: string
): void {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8"
  }

  if (downloadFilename) {
    headers["Content-Disposition"] = `attachment; filename="${downloadFilename}"`
  }

  res.writeHead(statusCode, headers)
  res.end(JSON.stringify(payload, null, 2))
}

function textResponse(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  })
  res.end(message)
}

async function readRequestBody(req: IncomingMessage, maxBytes = 1_000_000): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0

    req.on("data", chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.length

      if (totalBytes > maxBytes) {
        reject(new Error("Corpo da requisição muito grande."))
        req.destroy()
        return
      }

      chunks.push(buffer)
    })

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
    req.on("error", reject)
  })
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!AUTH_BEARER_KEY) {
    return false
  }

  const authorization = req.headers.authorization
  if (!authorization?.startsWith("Bearer ")) {
    return false
  }

  const token = authorization.slice("Bearer ".length).trim()
  return token === AUTH_BEARER_KEY
}

async function transcreverViaLegendas(videoId: string): Promise<{ transcript: string; language?: string } | null> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript")
    const idiomas = ["pt", "pt-BR", "pt-PT", "en", "en-US"]
    const maxTentativas = 3
    const delayMs = 1000

    for (const lang of [...idiomas, undefined]) {
      let ultimoErro = ""

      for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
          const opcoes = lang
            ? {
                lang,
                requestOptions: {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                  }
                }
              }
            : {
                requestOptions: {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                  }
                }
              }

          const segmentos = await YoutubeTranscript.fetchTranscript(videoId, opcoes)

          if (segmentos && segmentos.length > 0) {
            log("info", `youtube-transcript funcionou${lang ? ` (idioma: ${lang})` : ""}`)
            return {
              transcript: segmentos.map(segmento => segmento.text.trim()).join(" "),
              language: lang
            }
          }
        } catch (error) {
          ultimoErro = error instanceof Error ? error.message : String(error)

          if (tentativa < maxTentativas) {
            log(
              "aviso",
              `youtube-transcript tentativa ${tentativa}/${maxTentativas} falhou${lang ? ` (idioma: ${lang})` : ""}, aguardando ${delayMs}ms...`
            )
            await new Promise(resolve => setTimeout(resolve, delayMs))
          } else {
            log(
              "aviso",
              `youtube-transcript falhou após ${maxTentativas} tentativas${lang ? ` (idioma: ${lang})` : ""}: ${ultimoErro}`
            )
          }
        }
      }
    }
  } catch {
    log("aviso", "youtube-transcript não instalado ou indisponível; usando fallback de áudio.")
  }

  return null
}

function criarArquivoTemporario(): { base: string; audioPath: string } {
  const nome = `yt-transcribe-${Date.now()}-${randomUUID()}`
  const base = path.join(os.tmpdir(), nome)
  return {
    base,
    audioPath: `${base}.mp3`
  }
}

function baixarAudio(url: string): { audioPath: string } | { error: string; details?: string } {
  const check = spawnSync("python3", ["-m", "yt_dlp", "--version"], { encoding: "utf-8" })
  if (check.error) {
    const message = "yt-dlp não encontrado no container ou na máquina."
    log("erro", message)
    return { error: message, details: check.error.message }
  }

  const { base, audioPath } = criarArquivoTemporario()

  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath)
  }

  log("info", "Baixando áudio do vídeo...")

  const args = [
    "-m",
    "yt_dlp",
    "-f",
    "bestaudio/best",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "64K",
    "-o",
    `${base}.%(ext)s`,
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--extractor-args",
    "youtube:player_client=android"
  ]

  args.push(url)

  const resultado = spawnSync("python3", args, { encoding: "utf-8", stdio: "pipe" })

  if (resultado.status !== 0) {
    const message = "Falha ao baixar áudio do vídeo."
    log("erro", `${message}\n${resultado.stderr}`)
    return { error: message, details: resultado.stderr || resultado.stdout || "yt-dlp retornou erro desconhecido." }
  }

  if (!fs.existsSync(audioPath)) {
    const message = "Arquivo de áudio não encontrado após o download."
    log("erro", message)
    return { error: message }
  }

  const tamanhoMB = fs.statSync(audioPath).size / (1024 * 1024)
  log("info", `Áudio baixado: ${tamanhoMB.toFixed(1)} MB`)
  return { audioPath }
}

async function chamarOpenRouter(
  audioBytes: Buffer,
  parte = 0,
  total = 1,
  languageOpenRouter = "pt"
): Promise<{ transcript: string; usage?: OpenRouterUsage } | null> {
  const sufixo = total > 1 ? ` (parte ${parte}/${total})` : ""
  log("info", `Transcrevendo via OpenRouter (${OPENROUTER_MODEL})${sufixo}...`)

  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      input_audio: {
        data: audioBytes.toString("base64"),
        format: "mp3"
      },
      language: languageOpenRouter
    }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const corpo = await response.text()
    log("erro", `HTTP ${response.status}: ${corpo}`)
    return null
  }

  const data = (await response.json()) as OpenRouterResponse

  if (data.error) {
    log("erro", `OpenRouter: ${data.error.message}`)
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

async function transcreverViaOpenRouter(
  audioPath: string,
  languageOpenRouter = "pt"
): Promise<{ transcript: string; usage?: OpenRouterUsage } | null> {
  if (!OPENROUTER_API_KEY) {
    log("erro", "Configure a variável OPENROUTER_API_KEY no ambiente.")
    return null
  }

  const audioBytes = fs.readFileSync(audioPath)

  if (audioBytes.length <= CHUNK_SIZE_BYTES) {
    return await chamarOpenRouter(audioBytes, 0, 1, languageOpenRouter)
  }

  const totalChunks = Math.ceil(audioBytes.length / CHUNK_SIZE_BYTES)
  log(
    "info",
    `Áudio grande (${(audioBytes.length / 1024 / 1024).toFixed(1)} MB) — dividindo em ${totalChunks} partes...`
  )

  const partes: string[] = []
  let usage: OpenRouterUsage | undefined

  for (let i = 0; i < totalChunks; i++) {
    const inicio = i * CHUNK_SIZE_BYTES
    const fim = Math.min(inicio + CHUNK_SIZE_BYTES, audioBytes.length)
    const chunk = audioBytes.subarray(inicio, fim)
    const resultado = await chamarOpenRouter(chunk, i + 1, totalChunks, languageOpenRouter)

    if (resultado) {
      partes.push(resultado.transcript)
      usage = resultado.usage
    } else {
      log("aviso", `Parte ${i + 1} falhou, pulando...`)
    }
  }

  return partes.length > 0 ? { transcript: partes.join(" "), usage } : null
}

async function transcreverUrlDoYoutube(
  url: string,
  languageOpenRouter = "pt"
): Promise<TranscriptionResult | ErrorResult> {
  const videoId = extrairVideoId(url)

  if (!videoId) {
    return { ok: false, error: `URL inválida ou não reconhecida: ${url}` }
  }

  log("info", `Vídeo ID: ${videoId}`)
  log("info", "Buscando transcrição via legendas do YouTube...")

  const legenda = await transcreverViaLegendas(videoId)
  if (legenda) {
    return {
      ok: true,
      videoId,
      sourceUrl: url,
      provider: "youtube-transcript",
      method: "youtube-transcript",
      transcript: legenda.transcript,
      language: legenda.language,
      generatedAt: new Date().toISOString()
    }
  }

  log("info", "Legendas não disponíveis. Usando OpenRouter (Whisper Large V3)...")
  const audioResultado = baixarAudio(url)

  if ("error" in audioResultado) {
    return {
      ok: false,
      error: audioResultado.error,
      details: audioResultado.details
    }
  }

  try {
    const resultadoOpenRouter = await transcreverViaOpenRouter(audioResultado.audioPath, languageOpenRouter)

    if (!resultadoOpenRouter) {
      return { ok: false, error: "Não foi possível transcrever o vídeo por nenhum método." }
    }

    return {
      ok: true,
      videoId,
      sourceUrl: url,
      provider: "openrouter",
      method: "openrouter",
      transcript: resultadoOpenRouter.transcript,
      usage: resultadoOpenRouter.usage,
      generatedAt: new Date().toISOString()
    }
  } finally {
    try {
      fs.unlinkSync(audioResultado.audioPath)
    } catch {
      // ignore cleanup failures
    }
  }
}

function isJsonRequest(req: IncomingMessage): boolean {
  const accept = req.headers.accept ?? ""
  return accept.includes("application/json") || accept.includes("*/*")
}

async function handleTranscribe(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!AUTH_BEARER_KEY) {
    textResponse(res, 500, "AUTH_BEARER_KEY não configurada no servidor.")
    return
  }

  if (!isAuthorized(req)) {
    textResponse(res, 401, "Unauthorized. Envie Authorization: Bearer <sua-chave>.")
    return
  }

  if (req.method !== "POST") {
    textResponse(res, 405, "Use POST nesta rota.")
    return
  }

  let bodyText = ""

  try {
    bodyText = await readRequestBody(req)
  } catch (error) {
    const detalhes = error instanceof Error ? error.message : String(error)
    log("erro", `Falha ao ler o corpo da requisição: ${detalhes}`)
    textResponse(res, 400, "Falha ao ler o corpo da requisição.")
    return
  }

  let body: { url?: unknown; download?: unknown; language_openrouter?: unknown }

  try {
    body = JSON.parse(bodyText) as { url?: unknown; download?: unknown; language_openrouter?: unknown }
  } catch {
    textResponse(res, 400, "Body inválido. Envie JSON com a propriedade url.")
    return
  }

  const urlValue = typeof body.url === "string" ? body.url.trim() : ""
  if (!urlValue) {
    textResponse(res, 400, "A propriedade url é obrigatória.")
    return
  }

  const languageOpenRouter =
    typeof body.language_openrouter === "string" && body.language_openrouter.trim()
      ? body.language_openrouter.trim()
      : "pt"

  const resultado = await transcreverUrlDoYoutube(urlValue, languageOpenRouter)

  if (!resultado.ok) {
    const detalhes = resultado.details ? ` | details: ${resultado.details}` : ""
    log("erro", `Falha na transcrição: ${resultado.error}${detalhes}`)
    textResponse(res, 500, resultado.error)
    return
  }

  const download =
    url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true" || Boolean(body.download)
  const filename = `transcription-${resultado.videoId}.json`

  jsonResponse(res, 200, resultado, download ? filename : undefined)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url) {
    jsonResponse(res, 400, { ok: false, error: "Requisição inválida." })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`)

  if (req.method === "GET" && url.pathname === "/health") {
    jsonResponse(res, 200, {
      ok: true,
      error: undefined,
      details: "Server running"
    } as unknown as ErrorResult)
    return
  }

  if (url.pathname === "/transcribe") {
    await handleTranscribe(req, res, url)
    return
  }

  if (req.method === "GET" && url.pathname === "/") {
    const payload = {
      ok: true,
      error: undefined,
      details: 'Use POST /transcribe with Authorization: Bearer <key> and body { "url": "https://..." }'
    }

    jsonResponse(res, 200, payload as unknown as ErrorResult)
    return
  }

  jsonResponse(res, 404, { ok: false, error: "Rota não encontrada." })
}

function startServer(): void {
  if (!AUTH_BEARER_KEY) {
    log("aviso", "AUTH_BEARER_KEY não foi definida. O servidor vai responder 500 até ser configurada.")
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(error => {
      log("erro", String(error))
      if (!res.headersSent) {
        jsonResponse(res, 500, { ok: false, error: "Erro interno do servidor." })
      } else {
        res.end()
      }
    })
  })

  server.listen(PORT, "0.0.0.0", () => {
    log("info", `Servidor ouvindo em http://0.0.0.0:${PORT}`)
    log("info", "Rota: POST /transcribe")
    log("info", "Autenticação: Authorization: Bearer <sua-chave>")
  })
}

startServer()
