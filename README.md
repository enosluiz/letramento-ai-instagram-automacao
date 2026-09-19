# Automação de posts diários — @letramento.ai

Pipeline automático que gera, renderiza e publica um carrossel diário (6 lâminas + legenda) no Instagram, replicando o design da "Fábrica de Conteúdo Diário".

## Como funciona

1. `content/queue.json` guarda a fila de posts prontos (tema, texto de cada lâmina, legenda, hashtags).
2. Todo dia às 09:00 (horário de Brasília), o workflow **Post diário no Instagram** (`.github/workflows/daily-post.yml`):
   - Renderiza as 6 lâminas do próximo post não publicado (`scripts/render.js`, usando Playwright + `assets/slide-template.html`) em PNGs 1080×1350.
   - Commita as imagens em `published/<postId>/` para que fiquem acessíveis publicamente via `raw.githubusercontent.com` (exigido pela Graph API, que busca as imagens por URL).
   - Publica o carrossel no Instagram via Graph API (`scripts/post.js`).
   - Marca o post como `published: true` na fila.
3. A cada 45 dias, o workflow **Renovar token de acesso do Instagram** (`.github/workflows/refresh-token.yml`) renova o token de longa duração antes que expire (validade de ~60 dias).

## Secrets necessários (Settings → Secrets and variables → Actions)

- `IG_TOKEN` — token de acesso de longa duração do Instagram. ✅ já configurado.
- `IG_USER_ID` — ID da conta comercial do Instagram. ✅ já configurado.
- `ADMIN_GH_PAT` *(opcional, recomendado)* — PAT clássico com escopo `repo`, usado apenas pelo workflow de renovação de token para atualizar o secret `IG_TOKEN` automaticamente. Sem ele, a renovação precisa ser feita manualmente a cada ~60 dias.

## Visibilidade do repositório

O repositório precisa ser **público** (ou usar outro host de imagens) para que `raw.githubusercontent.com/.../published/...` seja acessível pela Graph API. Os secrets do GitHub Actions permanecem protegidos independentemente da visibilidade do repositório — apenas o conteúdo versionado (código e lâminas renderizadas) fica público.

## Rodando manualmente

No GitHub, aba **Actions** → **Post diário no Instagram** → **Run workflow**.

## Ampliando a fila

Adicione novos objetos em `content/queue.json` (campo `posts`), seguindo o schema dos posts existentes (`slide1`...`slide6`, `legenda`, `hashtags`, `published: false`).
