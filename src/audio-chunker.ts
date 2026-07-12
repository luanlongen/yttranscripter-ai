import { spawn, execFile } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { log } from "./logging.js"

function execFileAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })
}

function spawnAsync(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: "pipe" })
    let stderr = ""
    proc.stderr?.on("data", chunk => { stderr += chunk.toString() })
    proc.on("close", code => {
      if (code !== 0) log("warn", `ffmpeg stderr: ${stderr}`)
      resolve(code ?? 1)
    })
    proc.on("error", err => {
      log("warn", `ffmpeg erro: ${err.message}`)
      resolve(1)
    })
  })
}

export async function splitAudioByTime(audioPath: string, segmentMinutes = 5): Promise<string[]> {
  let durationSec = Infinity
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ])
    durationSec = parseFloat(stdout.trim())
  } catch (err) {
    log("warn", `ffprobe falhou, retornando áudio inteiro: ${err instanceof Error ? err.message : String(err)}`)
    return [audioPath]
  }

  const segmentSec = segmentMinutes * 60
  if (Number.isNaN(durationSec) || durationSec <= segmentSec) {
    log("info", `Áudio (${durationSec.toFixed(0)}s) menor que segmento (${segmentSec}s), não dividindo`)
    return [audioPath]
  }

  const base = audioPath.replace(/\.mp3$/, "")
  const dir = path.dirname(audioPath)
  const baseName = path.basename(base)

  log("info", `Dividindo áudio (${durationSec.toFixed(0)}s) em segmentos de ${segmentMinutes} min...`)
  const exitCode = await spawnAsync("ffmpeg", [
    "-i", audioPath,
    "-f", "segment",
    "-segment_time", `${segmentMinutes}:00`,
    "-c", "copy",
    `${base}_%03d.mp3`,
  ])

  if (exitCode !== 0) {
    log("warn", "ffmpeg falhou, tentando transcrever áudio inteiro como fallback")
    return [audioPath]
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(`${baseName}_`) && f.endsWith(".mp3"))
    .sort()

  if (files.length === 0) {
    log("warn", "Nenhum segmento gerado pelo ffmpeg")
    return [audioPath]
  }

  log("info", `${files.length} segmentos gerados`)
  return files.map(f => path.join(dir, f))
}
