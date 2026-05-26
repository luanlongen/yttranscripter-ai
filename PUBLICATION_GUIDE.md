# 📝 Guia Completo de Publicação no Apify

## Passo 1: Preparação da Ambiente

### 1.1 Instale o Apify CLI
```bash
npm install -g apify
```

### 1.2 Verifique a versão
```bash
apify --version
```

## Passo 2: Configuração Local

### 2.1 Instale as dependências do projeto
```bash
npm install
```

### 2.2 Teste o código localmente
```bash
npm run typecheck  # Verifica tipos TypeScript
npm start          # Executa o actor uma vez
```

**Nota:** Para que o teste local funcione, você precisa ter o `INPUT.json` no caminho correto:
```
storage/key_value_stores/default/INPUT.json
```

## Passo 3: Login na Apify

### 3.1 Execute o login
```bash
apify login
```

### 3.2 Insira suas credenciais
- Escolha entre login via email/senha ou token
- Recomendado: Use o token direto
- Obtenha em: https://console.apify.com/account/integrations

### 3.3 Verifique o login
```bash
apify info
```

## Passo 4: Publicação

### 4.1 Inicializar (se for primeiro actor)
Se for a primeira vez, você pode:
```bash
apify create-actor --name youtube-transcript-wrapper
```

Mas como já temos a estrutura, podemos pular direto para:

### 4.2 Fazer push do código
```bash
apify push
```

Este comando:
- Lê `.actorignore` para saber quais arquivos ignorar
- Compila TypeScript se necessário
- Envia para a plataforma Apify
- Cria um build

### 4.3 Acompanhe o progresso
A CLI mostrará:
```
Building actor...
Uploading files...
Actor published successfully!
Actor ID: xxxxx
```

## Passo 5: Testar na Plataforma Apify

### 5.1 Acesse o Console
1. Vá para: https://console.apify.com/actors
2. Procure por "youtube-transcript-wrapper" ou seu actor

### 5.2 Configure o Input
No console, você verá um formulário com os campos:
- **Video ID**: Copie de uma URL do YouTube
- **Include Metadata**: Toggle (padrão: true)
- **Apify Token**: Seu token (será mascarado como secret)

### 5.3 Execute um teste
Clique em "Start" e aguarde a execução

### 5.4 Veja os resultados
- Aba "Dataset": Dados retornados
- Aba "Key-Value Store": OUTPUT JSON completo
- Aba "Logs": Console output

## Passo 6: Usar via API

Após publicar, você pode chamar seu actor via API:

### 6.1 Obtenha o ID do seu actor
```bash
apify info
# ou veja em https://console.apify.com/actors
```

### 6.2 Execute via cURL
```bash
curl -X POST https://api.apify.com/v2/acts/{ACTOR_ID}/runs \
  -H "Authorization: Bearer {YOUR_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "zw_e_vVTq4Y",
    "metadata": true,
    "apifyToken": "apify_api_XXXXX"
  }'
```

### 6.3 JavaScript/Node.js
```typescript
import { ApifyClient } from "apify-client";

const client = new ApifyClient({
  token: "seu_token_aqui"
});

const run = await client.actor("seu_username/youtube-transcript-wrapper").call({
  videoId: "zw_e_vVTq4Y",
  metadata: true,
  apifyToken: "apify_api_XXXXX"
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### 6.4 Python
```python
from apify_client import ApifyClient

client = ApifyClient("seu_token_aqui")

run = client.actor("seu_username/youtube-transcript-wrapper").call(input={
    "videoId": "zw_e_vVTq4Y",
    "metadata": True,
    "apifyToken": "apify_api_XXXXX"
})

dataset = client.dataset(run["defaultDatasetId"])
items = dataset.list_items()
print(items)
```

## Passo 7: Atualizações Futuras

### Para atualizar o actor após mudanças:
```bash
# Faça suas modificações no código
# ...

# Valide o código
npm run typecheck

# Envie a atualização
apify push
```

A plataforma criará um novo build automaticamente.

## Dicas de Otimização

### 7.1 Reduzir tamanho da imagem Docker
- Remova dependências não utilizadas
- Use `.actorignore` para evitar enviar arquivos desnecessários

### 7.2 Performance
- Use caching quando possível
- Otimize chamadas à API Apify

### 7.3 Tratamento de Erros
- Implemente retries automáticos
- Log detalhado de erros

## Troubleshooting

### Problema: "Actor not found"
**Solução:** Certifique-se de que fez login e tem permissões

### Problema: "Input validation failed"
**Solução:** Verifique se o INPUT.json segue o schema em `.actor/input_schema.json`

### Problema: "Token expired"
**Solução:** Faça logout e login novamente:
```bash
apify logout
apify login
```

### Problema: "Build failed"
**Solução:** Verifique os logs:
```bash
apify logs  # Mostra os últimos logs
```

## Recursos Úteis

- 📖 [Documentação Apify SDK JS](https://docs.apify.com/sdk/js)
- 🎯 [Como publicar actors](https://docs.apify.com/platform/actors/publishing)
- 🔧 [Referência do actor.json](https://docs.apify.com/platform/actors/development/actor-definition)
- 💬 [Comunidade Apify](https://community.apify.com)
- 📚 [Exemplos de actors](https://apify.com/store)

---

**Próximo passo:** Execute `apify push` para publicar seu actor! 🚀
