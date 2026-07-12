export type LogLevel = "info" | "warn" | "error"

export function log(level: LogLevel, msg: string): void {
  const prefix = level === "info" ? "INFO" : level === "warn" ? "WARN" : "ERRO"
  console.log(`[${prefix}] ${msg}`)
}

export function maskKey(key: string): string {
  if (key.length <= 12) return "****"
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}
