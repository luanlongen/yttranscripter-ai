import { Actor } from "apify"
import { transcribeYoutubeUrl } from "./transcriber.js"
import { getResidentialProxyUrl } from "./proxy.js"
import { log } from "./logging.js"
import type { ActorInput, ErrorResult } from "./types.js"

async function main(): Promise<void> {
  await Actor.init()

  try {
    const input = await Actor.getInput<ActorInput>()
    if (!input?.youtubeUrl) {
      throw new Error("Invalid youtubeUrl - must be a non-empty string")
    }

    log("info", `Iniciando transcrição: ${input.youtubeUrl}`)

    let proxyUrl: string | undefined
    if (input.useProxy) {
      const url = await getResidentialProxyUrl()
      if (url) {
        proxyUrl = url
        log("info", "Proxy residencial habilitado para fetchCaptions")
      } else {
        log("warn", "useProxy=true mas proxy indisponível. Continuando sem proxy.")
      }
    }

    const result = await transcribeYoutubeUrl(input.youtubeUrl, {
      openRouterApiKey: input.openRouterApiKey,
      openRouterModel: input.openRouterModel ?? "openai/whisper-large-v3",
      language: input.language ?? "pt",
      segmentMinutes: input.segmentMinutes ?? 5,
      proxyUrl,
    })

    await Actor.setValue("OUTPUT", result)
    await Actor.pushData(result)

    if (result.success) {
      log("info", `Transcrição concluída via ${result.provider}`)
      const charge = await Actor.charge({ eventName: "transcription-completed" })
      if (charge.eventChargeLimitReached) {
        log("warn", "Limite de gastos atingido. Saindo graciosamente.")
        await Actor.exit()
        return
      }
    } else {
      log("error", `Transcrição falhou: ${result.error}`)
      process.exit(1)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log("error", `Execução falhou: ${errorMsg}`)

    try {
      let errorUrl = "unknown"
      try {
        const input = await Actor.getInput<ActorInput>()
        if (input?.youtubeUrl) errorUrl = input.youtubeUrl
      } catch {
        // ignore
      }

      const errorOutput: ErrorResult = {
        success: false,
        youtubeUrl: errorUrl,
        error: errorMsg,
        generatedAt: new Date().toISOString(),
      }
      await Actor.setValue("OUTPUT", errorOutput)
      await Actor.pushData(errorOutput)
    } catch {
      // ignore
    }

    process.exit(1)
  }

  await Actor.exit()
}

Actor.main(main)
