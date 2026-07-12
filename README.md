# YouTube Transcriber

Apify Actor que extrai transcrições de vídeos do YouTube. Primeiro tenta obter legendas disponíveis, depois baixa o áudio e transcreve via OpenRouter Whisper como fallback.

## Fluxo

```
Input (youtubeUrl)
  → Extrair videoId
  → Buscar legendas via YouTube timedtext (com opção de proxy residencial)
    → Se encontrar → Retorna transcrição (rápido, gratuito)
    → Se não encontrar → Baixar áudio via ytdl-core / yt-dlp
      → Dividir áudio em segmentos via ffmpeg
      → Transcrever cada segmento via OpenRouter Whisper
      → Retornar transcrição concatenada
```

## Input

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| youtubeUrl | string | Sim | URL completa do YouTube (youtube.com, youtu.be, shorts, embed) |
| openRouterApiKey | string | Não | API key do OpenRouter. Necessário se o vídeo não tiver legendas |
| openRouterModel | string | Não | Modelo Whisper. Default: openai/whisper-large-v3 |
| language | string | Não | Idioma para legendas e Whisper. Default: pt |
| segmentMinutes | integer | Não | Duração dos segmentos de áudio (1-30 min). Default: 5 |
| useProxy | boolean | Não | Usar proxy residencial Apify para buscar legendas. Default: false |

## Output (sucesso - legendas do YouTube)

```json
{
  "success": true,
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "videoId": "...",
  "transcript": "Conteúdo completo da transcrição...",
  "provider": "youtube-transcript",
  "language": "pt",
  "generatedAt": "2026-01-01T10:00:00.000Z"
}
```

## Output (sucesso - OpenRouter Whisper)

```json
{
  "success": true,
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "videoId": "...",
  "transcript": "Conteúdo completo da transcrição...",
  "provider": "openrouter",
  "usage": { "input_tokens": 1234, "output_tokens": 567 },
  "generatedAt": "2026-01-01T10:00:00.000Z"
}
```

## Output (erro)

```json
{
  "success": false,
  "youtubeUrl": "...",
  "error": "Descrição do erro",
  "details": "Detalhes adicionais (se disponível)",
  "generatedAt": "..."
}
```

## Como rodar localmente

```bash
# Instalar dependências
npm install

# Executar uma vez (precisa de storage/key_value_stores/default/INPUT.json)
npm run start

# Modo desenvolvimento com hot reload
npm run dev
```

## Como publicar na Apify

```bash
# Instalar Apify CLI
npm install -g apify

# Login
apify login

# Publicar
apify push
```

## Proxy Residencial

O campo `useProxy` ativa o proxy residencial da Apify para buscar legendas do YouTube. Isso ajuda a evitar bloqueios do Google quando o Actor roda em IPs de datacenter.

- **Custo:** O tráfego do proxy é cobrado por GB na sua conta da Apify (aproximadamente US$ 2-4/mês para 1000 transcrições)
- **Áudio nunca usa proxy:** O download de áudio sempre usa conexão direta (CDN do YouTube tolera IPs de datacenter, e proxy residencial seria caro para tráfego de áudio)
- **Self-host fora da Apify:** Se rodar em AWS EC2/Lightsail, você precisará de sua própria solução de proxy (BrightData, Smartproxy, Oxylabs) ou o fallback Whisper continuará funcionando

## Limitações

- IPs de datacenter podem ser bloqueados pelo YouTube ao buscar legendas sem proxy ativado
- Vídeos muito longos (>2h) são divididos em segmentos de N minutos para transcrição via Whisper
- Vídeos com restrição de idade ou região podem não ter legendas disponíveis
- Requer ffmpeg e python3 + yt-dlp instalados (já incluso no Dockerfile)

## Docker

```bash
docker build -t yt-transcriber .
docker run --rm -e OPENROUTER_API_KEY=xxx yt-transcriber
```
