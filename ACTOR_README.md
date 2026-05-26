# YouTube Transcript Wrapper - Apify Actor

Um actor para a plataforma Apify que extrai transcrições de vídeos do YouTube usando o popular YouTube transcript scraper da Apify.

## 📋 Descrição

Este é um **actor Apify** que atua como um wrapper para o `apihq/youtube-transcript-scraper`. Ele permite que você extraia facilmente transcrições de qualquer vídeo do YouTube com metadados opcionais.

## 🚀 Instalação e Publicação

### Pré-requisitos

- Conta na [Apify](https://apify.com)
- Node.js 20+ instalado localmente (para desenvolvimento)
- Apify CLI instalado: `npm install -g apify`

### Passos para Publicar na Apify

1. **Clone ou configure o repositório:**

   ```bash
   cd /caminho/para/seu/projeto
   ```

2. **Instale as dependências:**

   ```bash
   npm install
   ```

3. **Faça login na Apify CLI:**

   ```bash
   apify login
   ```

   Insira seu token do Apify quando solicitado. Você pode obtê-lo em: https://console.apify.com/account/integrations

4. **Publique o actor:**

   ```bash
   apify push
   ```

   Isso enviará seu código para a plataforma Apify e criará o actor.

5. **Acesse seu actor:**
   Vá para https://console.apify.com/actors e procure por seu novo actor na lista.

## 📥 Input (Entrada)

O actor aceita o seguinte JSON como entrada:

```json
{
  "videoId": "zw_e_vVTq4Y",
  "metadata": true,
  "apifyToken": "apify_api_XXXXXXX"
}
```

### Campos de Input

| Campo        | Tipo    | Requerido | Descrição                                                                          |
| ------------ | ------- | --------- | ---------------------------------------------------------------------------------- |
| `videoId`    | string  | ✅ Sim    | O ID do vídeo do YouTube (parte após `v=` na URL)                                  |
| `metadata`   | boolean | ❌ Não    | Se deve incluir metadados. Padrão: `true`                                          |
| `apifyToken` | string  | ✅ Sim    | Seu token API do Apify (obtenha em https://console.apify.com/account/integrations) |

### Exemplo de URL do YouTube

- URL: `https://www.youtube.com/watch?v=zw_e_vVTq4Y&t=120s`
- Video ID: `zw_e_vVTq4Y`

## 📤 Output (Saída)

O actor retorna um JSON com a seguinte estrutura:

```json
{
  "success": true,
  "videoId": "zw_e_vVTq4Y",
  "itemsCount": 1,
  "items": [
    {
      "videoId": "zw_e_vVTq4Y",
      "transcript": "Conteúdo da transcrição aqui...",
      "language": "pt"
    }
  ],
  "metadata": {
    "actorRunId": "xxx",
    "startedAt": "2024-01-01T10:00:00.000Z",
    "finishedAt": "2024-01-01T10:01:00.000Z",
    "status": "SUCCEEDED"
  }
}
```

Em caso de erro:

```json
{
  "success": false,
  "error": "Mensagem de erro detalhada",
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

## 🧪 Teste Local

Para testar o actor localmente antes de publicar:

1. **Configure o INPUT.json:**

   ```bash
   cat > storage/key_value_stores/default/INPUT.json << 'EOF'
   {
     "videoId": "zw_e_vVTq4Y",
     "metadata": true,
     "apifyToken": "apify_api_SEU_TOKEN_AQUI"
   }
   EOF
   ```

2. **Execute o actor localmente:**

   ```bash
   npm start
   ```

   Ou com watch mode:

   ```bash
   npm run dev
   ```

## 📦 Estrutura do Projeto

```
.
├── .actor/
│   ├── actor.json              # Configuração do actor
│   └── input_schema.json       # Schema do input (UI da plataforma)
├── .actorignore                # Arquivos a ignorar no build
├── src/
│   ├── main.ts                 # Arquivo principal do actor
│   └── yt.ts                   # Servidor HTTP (opcional)
├── storage/                    # Armazenamento local (ignorado no build)
├── Dockerfile                  # Build para a plataforma Apify
├── package.json
├── tsconfig.json
└── README.md                   # Este arquivo
```

## 🛠️ Desenvolvimento

### Scripts Disponíveis

```bash
# Instalar dependências
npm install

# Executar o actor
npm start

# Modo desenvolvimento com watch
npm run dev

# Verificar tipos TypeScript
npm run typecheck

# Build (compilar TypeScript)
npm run build
```

## 🔑 Segurança

⚠️ **Importante:**

- **Nunca** commite seu token Apify no repositório
- Use `.env` para desenvolvimento local ou Secrets na plataforma Apify
- O campo `apifyToken` é marcado como `isSecret` no schema, então será mascarado na UI

## 📚 Documentação Oficial

- [Apify SDK JavaScript](https://docs.apify.com/sdk/js)
- [Como Publicar um Actor](https://docs.apify.com/platform/actors/publishing)
- [Apify Platform Console](https://console.apify.com)

## 💰 Monetização

Após publicar, você pode opcionalmente:

1. Colocar um preço no seu actor
2. Configurar `BUILD_TAG` para builds pré-compilados
3. Adicionar badges e estatísticas

Veja mais em: https://docs.apify.com/platform/actors/publishing/monetization

## 📄 Licença

ISC

## 👤 Autor

Seu Nome / Seu Usuário da Apify

---

**Pronto para publicar? Execute:**

```bash
apify login
apify push
```

Seu actor estará disponível em poucos minutos! 🎉
