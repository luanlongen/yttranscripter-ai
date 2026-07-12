export interface OpenRouterUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  cached_tokens?: number
  [key: string]: unknown
}

export interface OpenRouterResponse {
  text?: string
  usage?: OpenRouterUsage
  error?: { message: string; code?: number }
}

export interface TranscriptionResult {
  success: true
  youtubeUrl: string
  videoId: string
  transcript: string
  provider: "youtube-transcript" | "openrouter"
  language?: string
  usage?: OpenRouterUsage
  generatedAt: string
}

export interface ErrorResult {
  success: false
  youtubeUrl: string
  error: string
  details?: string
  generatedAt: string
}

export interface ActorInput {
  youtubeUrl: string
  openRouterApiKey?: string
  openRouterModel?: string
  language?: string
  segmentMinutes?: number
  useProxy?: boolean
}

export type TranscriptionOutcome = TranscriptionResult | ErrorResult
