/* Aragonez Builder — notícias recentes por nicho.
   Configure no Netlify (Site configuration > Environment variables):
   GNEWS_API_KEY  = chave do gnews.io          (recomendado, tem português/Brasil)
   NEWS_API_KEY   = chave do newsapi.org       (alternativa)
   Sem chave, a função responde ok:false e o Builder segue com ângulos gerados pela IA. */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300'
};

function reply(status, body) {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function trim(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function dia(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

async function viaGNews(key, q) {
  const url = 'https://gnews.io/api/v4/search?q=' + encodeURIComponent(q) +
    '&lang=pt&country=br&max=10&sortby=publishedAt&apikey=' + encodeURIComponent(key);
  const r = await fetch(url);
  if (!r.ok) throw new Error('gnews ' + r.status);
  const d = await r.json();
  return (d.articles || []).map(a => ({
    titulo: trim(a.title, 180),
    resumo: trim(a.description, 260),
    fonte: (a.source && a.source.name) || 'GNews',
    data: dia(a.publishedAt),
    url: a.url || ''
  }));
}

async function viaNewsApi(key, q) {
  const url = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(q) +
    '&language=pt&sortBy=publishedAt&pageSize=10&apiKey=' + encodeURIComponent(key);
  const r = await fetch(url);
  if (!r.ok) throw new Error('newsapi ' + r.status);
  const d = await r.json();
  return (d.articles || []).map(a => ({
    titulo: trim(a.title, 180),
    resumo: trim(a.description, 260),
    fonte: (a.source && a.source.name) || 'NewsAPI',
    data: dia(a.publishedAt),
    url: a.url || ''
  }));
}

/* Google News RSS: gratuito e sem chave. Categorias da "Notícia do dia". */
const CATEGORIAS = {
  tecnologia: { secao: 'TECHNOLOGY' },
  ia: { q: '"inteligência artificial" OR ChatGPT OR OpenAI OR Gemini OR "IA generativa"' },
  instagram: { q: 'Instagram OR Meta OR Threads OR "criadores de conteúdo" OR TikTok' },
  negocios: { secao: 'BUSINESS' },
  marketing: { q: 'marketing OR publicidade OR campanha OR "redes sociais" OR influenciador' },
  esportes: { secao: 'SPORTS' },
  cultura: { secao: 'ENTERTAINMENT' },
  comportamento: { q: 'pesquisa comportamento consumidores OR tendência OR geração Z OR hábitos' },
  agora: { secao: '' }
};

function decodificar(t) {
  return String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(xml, nome) {
  const m = xml.match(new RegExp('<' + nome + '[^>]*>([\\s\\S]*?)</' + nome + '>'));
  return m ? decodificar(m[1]) : '';
}

async function viaGoogleNews(cat, q) {
  const base = 'hl=pt-BR&gl=BR&ceid=BR:pt-419';
  const c = CATEGORIAS[cat];
  let url;
  if (q) url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + '&' + base;
  else if (c && c.q) url = 'https://news.google.com/rss/search?q=' + encodeURIComponent('(' + c.q + ') when:2d') + '&' + base;
  else if (c && c.secao) url = 'https://news.google.com/rss/headlines/section/topic/' + c.secao + '?' + base;
  else url = 'https://news.google.com/rss?' + base;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AragonezBuilder' } });
  if (!r.ok) throw new Error('google news ' + r.status);
  const xml = await r.text();
  const itens = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map(it => {
    const fonte = tag(it, 'source');
    let titulo = tag(it, 'title');
    if (fonte && titulo.endsWith(' - ' + fonte)) titulo = titulo.slice(0, -(fonte.length + 3));
    const quando = new Date(tag(it, 'pubDate'));
    return {
      titulo: trim(titulo, 200), resumo: '', fonte: fonte || 'Google Notícias',
      data: dia(quando.toISOString && !isNaN(quando) ? quando.toISOString() : ''),
      ts: isNaN(quando) ? 0 : quando.getTime(), url: tag(it, 'link')
    };
  }).filter(i => i.titulo);
  itens.sort((a, b) => b.ts - a.ts);
  return itens.slice(0, 14);
}

exports.handler = async (event) => {
  const gnews = process.env.GNEWS_API_KEY || '';
  const newsapi = process.env.NEWS_API_KEY || '';

  if ((event.httpMethod || 'GET') === 'GET' && !(event.queryStringParameters || {}).q && !(event.queryStringParameters || {}).cat) {
    return reply(200, { ok: true, configured: { gnews: !!gnews, newsapi: !!newsapi }, uso: '/.netlify/functions/news?q=nicho' });
  }

  const params = event.queryStringParameters || {};
  const cat = String(params.cat || '').toLowerCase();

  /* Feed "Notícia do dia": categoria fixa ou busca livre, sempre pelo Google News. */
  if (cat) {
    try {
      const itens = await viaGoogleNews(CATEGORIAS[cat] ? cat : '', String(params.q || '').slice(0, 120));
      return reply(200, { ok: itens.length > 0, source: 'Google Notícias', cat: cat, itens: itens, agora: Date.now() });
    } catch (err) {
      return reply(200, { ok: false, reason: String((err && err.message) || 'falha'), itens: [], source: '' });
    }
  }

  const q = String(params.q || '').slice(0, 120) || 'marketing';

  if (!gnews && !newsapi) {
    try {
      const itens = await viaGoogleNews('', q);
      return reply(200, { ok: itens.length > 0, source: 'Google Notícias', q: q, itens: itens });
    } catch (err) {
      return reply(200, { ok: false, reason: 'sem-chave', itens: [], source: '' });
    }
  }

  try {
    const itens = gnews ? await viaGNews(gnews, q) : await viaNewsApi(newsapi, q);
    const limpos = itens.filter(i => i.titulo);
    return reply(200, {
      ok: limpos.length > 0,
      source: gnews ? 'GNews' : 'NewsAPI',
      q: q,
      itens: limpos
    });
  } catch (err) {
    return reply(200, { ok: false, reason: String((err && err.message) || 'falha'), itens: [], source: '' });
  }
};
