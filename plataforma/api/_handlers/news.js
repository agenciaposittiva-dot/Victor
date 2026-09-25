/* Aragonez Builder — notícias recentes por nicho.
   Configure no Netlify (Site configuration > Environment variables):
   GNEWS_API_KEY  = chave do gnews.io          (recomendado, tem português/Brasil)
   NEWS_API_KEY   = chave do newsapi.org       (alternativa)
   Sem chave, a função responde ok:false e o Builder segue com ângulos gerados pela IA. */

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=600'
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

exports.handler = async (event) => {
  const gnews = process.env.GNEWS_API_KEY || '';
  const newsapi = process.env.NEWS_API_KEY || '';

  if ((event.httpMethod || 'GET') === 'GET' && !(event.queryStringParameters || {}).q) {
    return reply(200, { ok: true, configured: { gnews: !!gnews, newsapi: !!newsapi }, uso: '/.netlify/functions/news?q=nicho' });
  }

  const q = String((event.queryStringParameters || {}).q || '').slice(0, 120) || 'marketing';

  if (!gnews && !newsapi) {
    return reply(200, { ok: false, reason: 'sem-chave', itens: [], source: '' });
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
