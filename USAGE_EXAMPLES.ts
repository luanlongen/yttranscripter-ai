// Exemplos de como usar o YouTube Transcript Wrapper Actor

// ============================================
// 1. USAR VIA NODE.JS COM APIFY CLIENT
// ============================================

import { ApifyClient } from "apify-client"

async function example1_callActorWithApifyClient() {
  const client = new ApifyClient({
    token: "seu_token_apify_aqui"
  })

  // Chamar o actor e esperar por ele
  const run = await client.actor("seu_username/youtube-transcript-wrapper").call({
    videoId: "dQw4w9WgXcQ", // Rick Roll ID
    metadata: true,
    apifyToken: "seu_token_apify_aqui"
  })

  // Obter os resultados do dataset
  const { items } = await client.dataset(run.defaultDatasetId).listItems()

  console.log("Transcrições obtidas:", items)
  return items
}

// ============================================
// 2. USAR VIA FETCH (HTTP REST API)
// ============================================

async function example2_callActorViaHTTP() {
  const ACTOR_ID = "seu_username/youtube-transcript-wrapper"
  const API_TOKEN = "seu_token_apify_aqui"

  const response = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      videoId: "dQw4w9WgXcQ",
      metadata: true,
      apifyToken: API_TOKEN
    })
  })

  const run = await response.json()
  console.log("Run criado:", run.id)

  // Aguardar conclusão (polling)
  let status = "RUNNING"
  while (status === "RUNNING") {
    await new Promise(resolve => setTimeout(resolve, 1000)) // Espera 1 segundo

    const statusResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${run.id}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` }
    })

    const runData = await statusResponse.json()
    status = runData.status
    console.log("Status:", status)
  }

  return run.id
}

// ============================================
// 3. OBTER DATASET APÓS EXECUÇÃO
// ============================================

async function example3_getDatasetResults() {
  const client = new ApifyClient({
    token: "seu_token_apify_aqui"
  })

  const ACTOR_ID = "seu_username/youtube-transcript-wrapper"
  const RUN_ID = "seu_run_id_aqui" // Obtido após chamar o actor

  // Obter informações da execução
  const run = await client.actor(ACTOR_ID).call()

  // Obter OUTPUT específico
  const kvStore = await client.keyValueStore(run.defaultKeyValueStoreId)
  const output = await kvStore.getValue("OUTPUT")

  console.log("Output completo:", output)

  // Se success === true
  if (output?.success) {
    console.log("Video ID:", output.videoId)
    console.log("Itens encontrados:", output.itemsCount)
    console.log("Items:", output.items)
    console.log("Metadata:", output.metadata)
  } else {
    console.error("Erro:", output?.error)
  }
}

// ============================================
// 4. INTEGRAÇÃO COM EXPRESS (WEBHOOK)
// ============================================

import express from "express"

const app = express()
app.use(express.json())

// Endpoint que dispara o actor
app.post("/api/transcribe", async (req, res) => {
  const { videoId, metadata = true, apifyToken } = req.body

  // Validar input
  if (!videoId || !apifyToken) {
    return res.status(400).json({
      error: "Missing videoId or apifyToken"
    })
  }

  try {
    const client = new ApifyClient({ token: apifyToken })

    const run = await client.actor("seu_username/youtube-transcript-wrapper").call({
      videoId,
      metadata,
      apifyToken
    })

    // Obter resultado
    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    res.json({
      success: true,
      runId: run.id,
      itemsCount: items.length,
      items
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
})

// ============================================
// 5. PROCESSAMENTO EM BATCH
// ============================================

async function example5_batchProcessing() {
  const videos = [
    "dQw4w9WgXcQ", // ID1
    "9bZkp7q19f0", // ID2
    "E8I7svnFLXw" // ID3
  ]

  const client = new ApifyClient({
    token: "seu_token_apify_aqui"
  })

  const ACTOR_ID = "seu_username/youtube-transcript-wrapper"

  // Iniciar todas as execuções em paralelo
  const runs = await Promise.all(
    videos.map(videoId =>
      client.actor(ACTOR_ID).call({
        videoId,
        metadata: true,
        apifyToken: "seu_token_apify_aqui"
      })
    )
  )

  console.log(`${runs.length} execuções iniciadas`)

  // Aguardar todas as execuções
  const allResults = await Promise.all(
    runs.map(async run => {
      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      return items
    })
  )

  // Consolidar resultados
  const flatResults = allResults.flat()
  console.log(`Total de transcrições: ${flatResults.length}`)

  return flatResults
}

// ============================================
// 6. TRATAMENTO DE ERROS ROBUSTO
// ============================================

async function example6_robustErrorHandling() {
  const client = new ApifyClient({
    token: "seu_token_apify_aqui"
  })

  try {
    const run = await client.actor("seu_username/youtube-transcript-wrapper").call(
      {
        videoId: "dQw4w9WgXcQ",
        metadata: true,
        apifyToken: "seu_token_apify_aqui"
      },
      {
        timeout: 30 * 60 * 1000, // 30 minutos
        webhookEventTypes: ["ACTOR_RUN_SUCCEEDED", "ACTOR_RUN_FAILED"]
      }
    )

    // Verificar se foi bem-sucedido
    if (run.status !== "SUCCEEDED") {
      throw new Error(`Run falhou com status: ${run.status}`)
    }

    const kvStore = await client.keyValueStore(run.defaultKeyValueStoreId)
    const output = await kvStore.getValue("OUTPUT")

    if (!output?.success) {
      throw new Error(`Actor retornou erro: ${output?.error}`)
    }

    return output
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        console.error("Timeout na execução do actor")
      } else if (error.message.includes("not found")) {
        console.error("Actor não encontrado. Verifique o ID")
      } else {
        console.error("Erro:", error.message)
      }
    }

    throw error
  }
}

// ============================================
// 7. MONITORAR EXECUÇÃO COM LOGS
// ============================================

async function example7_monitorWithLogs() {
  const client = new ApifyClient({
    token: "seu_token_apify_aqui"
  })

  const run = await client.actor("seu_username/youtube-transcript-wrapper").call({
    videoId: "dQw4w9WgXcQ",
    metadata: true,
    apifyToken: "seu_token_apify_aqui"
  })

  // Obter logs
  const log = await client.log(run.logId).get()
  console.log("Logs da execução:")
  console.log(log)

  // Obter dataset
  const dataset = await client.dataset(run.defaultDatasetId).listItems()
  console.log("Dados do dataset:", dataset)

  // Obter key-value store
  const kvStore = await client.keyValueStore(run.defaultKeyValueStoreId)
  const output = await kvStore.getValue("OUTPUT")
  console.log("Output armazenado:", output)

  return { log, dataset, output }
}

// ============================================
// DICAS DE BOAS PRÁTICAS
// ============================================

/*
1. SEGURANÇA
   - Nunca commite tokens no código
   - Use variáveis de ambiente: process.env.APIFY_TOKEN
   - Marque campos sensíveis como "secret" no schema

2. PERFORMANCE
   - Use processamento em batch para múltiplos vídeos
   - Implemente cache quando possível
   - Configure timeouts apropriados

3. TRATAMENTO DE ERROS
   - Sempre verifique run.status
   - Implemente retry logic
   - Log detalhado de erros

4. MONITORAMENTO
   - Verifique logs da execução
   - Monitore uso de dataset
   - Configure webhooks para notificações

5. CUSTO
   - Entenda o pricing da Apify
   - Monitore execuções longas
   - Use caching quando possível
*/

// Exportar funções para uso
export {
  example1_callActorWithApifyClient,
  example2_callActorViaHTTP,
  example3_getDatasetResults,
  example5_batchProcessing,
  example6_robustErrorHandling,
  example7_monitorWithLogs
}
