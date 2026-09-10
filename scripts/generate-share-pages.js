const fs = require('fs');
const path = require('path');

const SITE = 'https://lozapsy.help';
const API = process.env.LOZA_API_URL || 'https://api.loza-club.ru/api';
const ROOT = path.join(__dirname, '..');
const DEFAULT_IMAGE = `${SITE}/assets/social/loza-social-share-mockup.png`;
const STUB_LEAD = /архивный аудиоподкаст|аудиоподкаст закрытого клуба|открыть запись внутри|полная формулировка вопроса|полная расшифровка/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function clipText(value, max = 220) {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`;
}

function isStubLead(value) {
  const text = cleanText(value);
  return !text || (STUB_LEAD.test(text) && text.length < 90);
}

function buildLead(title, summary, sectionTitle) {
  const summaryText = cleanText(summary);
  if (summaryText && !isStubLead(summaryText)) return clipText(summaryText, 220);
  const name = cleanText(title);
  const section = cleanText(sectionTitle);
  if (name && section) return clipText(`${name}. ${section} клуба Лоза.`, 220);
  return clipText(name || 'Материал клуба Лоза', 220);
}

function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${SITE}${raw}`;
  return `${SITE}/${raw}`;
}

function fallbackCover(id) {
  let hash = 0;
  const key = String(id || 'loza');
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const n = String((hash % 10) + 1).padStart(2, '0');
  return `${SITE}/assets/webp/background${n}.webp`;
}

function safeId(id) {
  const value = String(id || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return '';
  return value;
}

function shareHtml({ title, description, image, pageUrl, clubUrl }) {
  const safeTitle = escapeHtml(title || 'Лоза');
  const safeLead = escapeHtml(description || '');
  const safeImage = escapeHtml(image || DEFAULT_IMAGE);
  const safePage = escapeHtml(pageUrl);
  const safeClub = escapeHtml(clubUrl);
  const jsClub = JSON.stringify(clubUrl);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeLead}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Лоза" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeLead}" />
    <meta property="og:url" content="${safePage}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeLead}" />
    <meta name="twitter:image" content="${safeImage}" />
    <link rel="canonical" href="${safePage}" />
  </head>
  <body>
    <script>location.replace(${jsClub});</script>
  </body>
</html>
`;
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writePage(kind, id, card) {
  const safe = safeId(id);
  if (!safe) return false;
  const html = shareHtml(card);
  const folder = path.join(ROOT, kind, safe);
  fs.mkdirSync(path.join(ROOT, kind), { recursive: true });
  fs.writeFileSync(path.join(ROOT, kind, `${safe}.html`), html, 'utf8');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.html'), html, 'utf8');
  return true;
}

async function readJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function main() {
  let media = [];
  let posts = [];
  const localContent = process.env.LOZA_CONTENT_JSON;
  try {
    if (localContent) {
      const content = JSON.parse(fs.readFileSync(localContent, 'utf8'));
      media = (content.entries || []).map((entry) => ({
        id: entry.slug,
        title: cleanText(entry.title) || 'Лоза',
        description: buildLead(entry.title, entry.summary, entry.section?.title),
        image: absoluteUrl(entry.coverUrl) || fallbackCover(entry.slug),
        clubUrl: `${SITE}/?media=${encodeURIComponent(entry.slug)}`,
      }));
    } else {
      const preview = await readJson(`${API}/share-preview`);
      media = preview.media || [];
      posts = preview.posts || [];
    }
  } catch {
    const [content, feed] = await Promise.all([
      readJson(`${API}/content`),
      readJson(`${API}/feed`).catch(() => ({ posts: [] })),
    ]);
    media = (content.entries || []).map((entry) => ({
      id: entry.slug,
      title: cleanText(entry.title) || 'Лоза',
      description: buildLead(entry.title, entry.summary, entry.section?.title),
      image: absoluteUrl(entry.coverUrl) || fallbackCover(entry.slug),
      clubUrl: `${SITE}/?media=${encodeURIComponent(entry.slug)}`,
    }));
    posts = (feed.posts || []).map((row) => ({
      id: row.id,
      title: cleanText(row.title) || clipText(row.body, 72) || 'Пост клуба Лоза',
      description: clipText(row.body, 220) || cleanText(row.title) || 'Пост клуба Лоза',
      image: absoluteUrl(row.imageUrl) || DEFAULT_IMAGE,
      clubUrl: `${SITE}/?post=${encodeURIComponent(row.id)}`,
    }));
  }

  if (!media.some((item) => item.id === 'u-mtttwc0hvv')) {
    media.push({
      id: 'u-mtttwc0hvv',
      title: 'Разбор домашнего задания. Тема «Мужское-Женское», часть 2 от 01.06.26',
      description: 'Видеоразбор домашней практики: замечаем, что стоит за поведением ребёнка, и ищем более устойчивую реакцию родителя.',
      image: fallbackCover('u-mtttwc0hvv'),
      clubUrl: `${SITE}/?media=u-mtttwc0hvv`,
    });
  }

  resetDir(path.join(ROOT, 'm'));
  resetDir(path.join(ROOT, 'p'));

  let written = 0;
  media.forEach((item) => {
    if (writePage('m', item.id, {
      title: item.title,
      description: item.description,
      image: item.image || fallbackCover(item.id),
      pageUrl: `${SITE}/m/${item.id}`,
      clubUrl: item.clubUrl || `${SITE}/?media=${encodeURIComponent(item.id)}`,
    })) written += 1;
  });
  posts.forEach((item) => {
    if (writePage('p', item.id, {
      title: item.title,
      description: item.description,
      image: item.image || DEFAULT_IMAGE,
      pageUrl: `${SITE}/p/${item.id}`,
      clubUrl: item.clubUrl || `${SITE}/?post=${encodeURIComponent(item.id)}`,
    })) written += 1;
  });

  fs.writeFileSync(path.join(ROOT, '.nojekyll'), '', 'utf8');
  console.log(`Wrote ${written} share pages (${media.length} media, ${posts.length} posts)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
