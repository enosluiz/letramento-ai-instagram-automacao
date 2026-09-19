// scripts/render.js
// Renderiza as 6 lâminas do próximo post não publicado da fila (content/queue.json)
// como PNGs 1080x1350, usando o template assets/slide-template.html
// (mesmo design do artifact "Fábrica de Conteúdo Diário").
//
// Uso: node scripts/render.js
// Saída: output/<postId>/slide1.png ... slide6.png

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'content', 'queue.json');
const TEMPLATE_PATH = path.join(ROOT, 'assets', 'slide-template.html');

function loadQueue() {
  return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
}

function nextPost(queue) {
  return queue.posts.find(p => !p.published);
}

// Converte cada slideN do post no shape esperado pelo template.
function slideData(post, n) {
  const s = post[`slide${n}`];
  if (!s) return null;
  return {
    pageLabel: `${n}/6`,
    chapeu: s.chapeu || '',
    titulo: s.titulo || '',
    texto: s.texto || '',
    itens: s.itens || [],
    prompt: s.prompt || '',
    frase: s.frase || '',
    cta: n === 6 ? (s.cta || 'Siga @letramento.ai para mais conteúdo sobre pesquisa e IA.') : ''
  };
}

async function main() {
  if (!existsSync(QUEUE_PATH)) {
    console.error(`Fila não encontrada em ${QUEUE_PATH}`);
    process.exit(1);
  }
  const queue = loadQueue();
  const post = nextPost(queue);
  if (!post) {
    console.log('Nenhum post pendente na fila. Nada a renderizar.');
    process.exit(0);
  }

  const outDir = path.join(ROOT, 'output', post.id);
  mkdirSync(outDir, { recursive: true });

  const templateUrl = 'file://' + TEMPLATE_PATH;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const slidePaths = [];
  for (let n = 1; n <= 6; n++) {
    const data = slideData(post, n);
    if (!data) continue;
    await page.goto(templateUrl);
    await page.waitForFunction(() => typeof window.__renderSlide === 'function');
    await page.evaluate((d) => window.__renderSlide(d), data);
    // Garante que as fontes web carreguem antes do screenshot.
    await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());
    const outPath = path.join(outDir, `slide${n}.png`);
    await page.screenshot({ path: outPath });
    slidePaths.push(outPath);
    console.log(`Renderizado: ${outPath}`);
  }

  await browser.close();

  // Guarda metadados do post + caminhos das lâminas para o script de publicação.
  writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({ postId: post.id, legenda: post.legenda, hashtags: post.hashtags, slides: slidePaths.map(p => path.basename(p)) }, null, 2)
  );

  console.log(`Post ${post.id} renderizado com sucesso em ${outDir}`);
}

main().catch(err => {
  console.error('Erro ao renderizar lâminas:', err);
  process.exit(1);
});
