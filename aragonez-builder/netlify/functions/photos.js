/* Aragonez Builder — banco de fotos gratuito (Unsplash, com Pexels de reserva).

   Variáveis no Netlify (Site configuration > Environment variables):
   UNSPLASH_ACCESS_KEY  "Access Key" de um app em unsplash.com/oauth/applications (grátis)
   PEXELS_API_KEY       opcional, de pexels.com/api (grátis)

   GET  ?q=termos&orientation=portrait|landscape|squarish&n=6
        → { ok, fotos:[{ id, url, thumb, autor, autorUrl, fonte, download }] }
   POST { action:'baixou', download }  avisa o Unsplash que a foto foi usada
        (exigência das diretrizes da API). */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status, body) => ({ statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) });
const UTM = 'utm_source=aragonez_builder&utm_medium=referral';

async function viaUnsplash(key, q, orientation, n) {
  const url = 'https://api.unsplash.com/search/photos?per_page=' + n + '&content_filter=high&query=' + encodeURIComponent(q) +
    (orientation ? '&orientation=' + orientation : '');
  const r = await fetch(url, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.errors && d.errors[0]) || 'unsplash ' + r.status);
  return (d.results || []).map(f => ({
    id: 'u:' + f.id,
    url: f.urls.raw + '&w=1400&q=82&fm=jpg&fit=max',
    thumb: f.urls.small,
    autor: (f.user && f.user.name) || 'Unsplash',
    autorUrl: ((f.user && f.user.links && f.user.links.html) || 'https://unsplash.com') + '?' + UTM,
    fonte: 'Unsplash',
    download: (f.links && f.links.download_location) || ''
  }));
}

async function viaPexels(key, q, orientation, n) {
  const ori = orientation === 'squarish' ? 'square' : orientation;
  const url = 'https://api.pexels.com/v1/search?per_page=' + n + '&query=' + encodeURIComponent(q) + (ori ? '&orientation=' + ori : '');
  const r = await fetch(url, { headers: { Authorization: key } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'pexels ' + r.status);
  return (d.photos || []).map(f => ({
    id: 'p:' + f.id,
    url: f.src.large2x || f.src.large,
    thumb: f.src.medium,
    autor: f.photographer || 'Pexels',
    autorUrl: f.photographer_url || 'https://www.pexels.com',
    fonte: 'Pexels',
    download: ''
  }));
}

exports.handler = async (event) => {
  const unsplash = process.env.UNSPLASH_ACCESS_KEY || '';
  const pexels = process.env.PEXELS_API_KEY || '';
  const configured = { unsplash: !!unsplash, pexels: !!pexels };

  if ((event.httpMethod || 'GET') === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
    const dl = String(body.download || '');
    if (body.action === 'baixou' && unsplash && /^https:\/\/api\.unsplash\.com\//.test(dl)) {
      try { await fetch(dl, { headers: { Authorization: 'Client-ID ' + unsplash } }); } catch (e) { /* não bloqueia */ }
    }
    return reply(200, { ok: true });
  }

  const p = event.queryStringParameters || {};
  const q = String(p.q || '').trim().slice(0, 120);
  if (!q) return reply(200, { ok: true, configured, uso: 'GET ?q=termos&orientation=portrait' });
  if (!unsplash && !pexels) return reply(200, { ok: false, reason: 'sem-chave-fotos', configured });

  const orientation = ['portrait', 'landscape', 'squarish'].indexOf(p.orientation) !== -1 ? p.orientation : '';
  const n = Math.max(1, Math.min(20, Number(p.n) || 6));
  const erros = [];
  const fontes = [unsplash && (() => viaUnsplash(unsplash, q, orientation, n)), pexels && (() => viaPexels(pexels, q, orientation, n))].filter(Boolean);
  for (const f of fontes) {
    try {
      const fotos = await f();
      if (fotos.length) return reply(200, { ok: true, configured, fotos });
      erros.push('sem resultado');
    } catch (err) { erros.push(String((err && err.message) || 'falha')); }
  }
  return reply(200, { ok: false, reason: erros[erros.length - 1] || 'sem resultado', erros, configured });
};
