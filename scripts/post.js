// scripts/post.js
// Publica o carrossel (6 lâminas) + legenda no Instagram via Graph API,
// usando as imagens já commitadas/publicadas no repositório (raw.githubusercontent.com).
// Depois marca o post como published=true em content/queue.json.
//
// Variáveis de ambiente esperadas (GitHub Actions Secrets):
//   IG_TOKEN    - token de acesso de longa duração
//   IG_USER_ID  - Instagram Business Account ID
//   GH_REPO     - "owner/repo" (para montar as URLs raw das imagens)
//   GITHUB_REF_NAME (opcional) - branch onde as imagens foram commitadas (default: main)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'content', 'queue.json');

const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const GH_REPO = process.env.GH_REPO || 'enosluiz/letramento-ai-instagram-automacao';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

if (!IG_TOKEN || !IG_USER_ID) {
  console.error('IG_TOKEN e IG_USER_ID precisam estar definidos como variáveis de ambiente.');
  process.exit(1);
}

function rawUrl(postId, filename) {
  return `https://raw.githubusercontent.com/${GH_REPO}/${BRANCH}/published/${postId}/${filename}`;
}

async function graphPost(pathSuffix, params) {
  const url = `${GRAPH_BASE}/${pathSuffix}`;
  const body = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Graph API erro em ${pathSuffix}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilFinished(containerId) {
  for (let i = 0; i < 20; i++) {
    const url = `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${IG_TOKEN}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status_code === 'FINISHED') return true;
    if (json.status_code === 'ERROR') throw new Error(`Container ${containerId} falhou: ${JSON.stringify(json)}`);
    await sleep(3000);
  }
  throw new Error(`Timeout esperando container ${containerId} ficar pronto.`);
}

async function main() {
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
  const post = queue.posts.find(p => !p.published);
  if (!post) {
    console.log('Nenhum post pendente para publicar.');
    return;
  }

  const metaPath = path.join(ROOT, 'output', post.id, 'meta.json');
  if (!existsSync(metaPath)) {
    console.error(`meta.json não encontrado para ${post.id}. Rode "npm run render" primeiro.`);
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  console.log(`Publicando post ${post.id} (${meta.slides.length} lâminas)...`);

  // 1) Cria um container de imagem por lâmina (is_carousel_item: true)
  const itemIds = [];
  for (const filename of meta.slides) {
    const image_url = rawUrl(post.id, filename);
    const item = await graphPost(`${IG_USER_ID}/media`, {
      image_url,
      is_carousel_item: 'true'
    });
    itemIds.push(item.id);
    console.log(`  Item criado: ${item.id} (${image_url})`);
  }

  // 2) Cria o container do carrossel
  const caption = `${post.legenda}\n\n${(post.hashtags || []).join(' ')}`.trim();
  const carousel = await graphPost(`${IG_USER_ID}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: itemIds.join(',')
  });
  console.log(`  Container do carrossel: ${carousel.id}`);

  await waitUntilFinished(carousel.id);

  // 3) Publica
  const publish = await graphPost(`${IG_USER_ID}/media_publish`, {
    creation_id: carousel.id
  });
  console.log(`Post publicado! media id: ${publish.id}`);

  // 4) Marca como publicado na fila
  post.published = true;
  post.published_at = new Date().toISOString();
  post.ig_media_id = publish.id;
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
  console.log(`Fila atualizada: ${post.id} marcado como published.`);
}

main().catch(err => {
  console.error('Erro ao publicar:', err);
  process.exit(1);
});
