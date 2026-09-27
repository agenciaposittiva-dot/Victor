/* Aragonez Builder — Raio-X do Instagram.
   Ponto único de integração com a fonte de dados do perfil. Nada é inventado aqui:
   sem credencial configurada, a função responde ok:false e a interface avisa o usuário.

   Variáveis possíveis no Netlify (Site configuration > Environment variables):
   IG_ACCESS_TOKEN   = token da Instagram Graph API (perfis próprios / business)
   IG_BUSINESS_ID    = id da conta business ligada ao token
   APIFY_TOKEN       = token do Apify (scraper de perfis públicos)
   APIFY_ACTOR       = actor id do scraper (ex.: apify~instagram-profile-scraper)
*/

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function reply(status, body) {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function clean(handle) {
  return String(handle || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
}

async function viaGraph(token, businessId, user) {
  const fields = 'business_discovery.username(' + user + '){username,name,biography,followers_count,media_count,media.limit(24){caption,media_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url}}';
  const url = 'https://graph.facebook.com/v21.0/' + encodeURIComponent(businessId) +
    '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(token);
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok || !d || !d.business_discovery) {
    throw new Error((d && d.error && d.error.message) || 'graph ' + r.status);
  }
  const b = d.business_discovery;
  const media = ((b.media || {}).data || []).map(m => ({
    tipo: m.media_type || '',
    legenda: String(m.caption || '').slice(0, 400),
    likes: m.like_count || 0,
    comentarios: m.comments_count || 0,
    data: m.timestamp || '',
    url: m.permalink || '',
    imagem: m.thumbnail_url || m.media_url || ''
  }));
  return {
    perfil: { usuario: b.username || user, nome: b.name || '', bio: String(b.biography || ''), seguidores: b.followers_count || 0, publicacoes: b.media_count || 0 },
    posts: media,
    fonte: 'Instagram Graph API'
  };
}

async function viaApify(token, actor, user) {
  const url = 'https://api.apify.com/v2/acts/' + encodeURIComponent(actor) +
    '/run-sync-get-dataset-items?token=' + encodeURIComponent(token);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [user], resultsLimit: 24 })
  });
  if (!r.ok) throw new Error('apify ' + r.status);
  const items = await r.json();
  const first = (items || [])[0] || {};
  const posts = (first.latestPosts || first.posts || []).map(m => ({
    tipo: m.type || '',
    legenda: String(m.caption || '').slice(0, 400),
    likes: m.likesCount || 0,
    comentarios: m.commentsCount || 0,
    data: m.timestamp || '',
    url: m.url || '',
    imagem: m.displayUrl || ''
  }));
  return {
    perfil: { usuario: first.username || user, nome: first.fullName || '', bio: String(first.biography || ''), seguidores: first.followersCount || 0, publicacoes: first.postsCount || 0 },
    posts: posts,
    fonte: 'Apify'
  };
}

/* ---------- Foto de perfil pelo @ ----------
   Tenta, em ordem: Graph API (se configurada), a página pública do Instagram
   e o unavatar.io. Devolve a imagem em base64 para o editor exportar sem
   bloqueio de CORS. */
async function baixarImagem(url, headers) {
  const r = await fetch(url, { headers: headers || {}, redirect: 'follow' });
  const tipo = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\//.test(tipo)) throw new Error('imagem ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1500) throw new Error('imagem vazia');
  return 'data:' + tipo.split(';')[0] + ';base64,' + buf.toString('base64');
}

async function fotoDePerfil(user, token, businessId) {
  const erros = [];
  if (token && businessId) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + encodeURIComponent(businessId) +
        '?fields=' + encodeURIComponent('business_discovery.username(' + user + '){profile_picture_url,name}') +
        '&access_token=' + encodeURIComponent(token);
      const d = await (await fetch(url)).json();
      const b = d && d.business_discovery;
      if (b && b.profile_picture_url) return { foto: await baixarImagem(b.profile_picture_url), nome: b.name || '', fonte: 'graph' };
      erros.push('graph: ' + ((d && d.error && d.error.message) || 'sem foto'));
    } catch (e) { erros.push('graph: ' + e.message); }
  }
  try {
    const r = await fetch('https://i.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(user), {
      headers: { 'x-ig-app-id': '936619743392459', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0' }
    });
    const d = await r.json().catch(() => null);
    const u = d && d.data && d.data.user;
    if (u && (u.profile_pic_url_hd || u.profile_pic_url)) {
      return { foto: await baixarImagem(u.profile_pic_url_hd || u.profile_pic_url), nome: u.full_name || '', fonte: 'instagram' };
    }
    erros.push('instagram ' + r.status);
  } catch (e) { erros.push('instagram: ' + e.message); }
  try {
    return { foto: await baixarImagem('https://unavatar.io/instagram/' + encodeURIComponent(user) + '?fallback=false'), nome: '', fonte: 'unavatar' };
  } catch (e) { erros.push('unavatar: ' + e.message); }
  throw new Error(erros.join(' | '));
}

exports.handler = async (event) => {
  const token = process.env.IG_ACCESS_TOKEN || '';
  const businessId = process.env.IG_BUSINESS_ID || '';
  const apify = process.env.APIFY_TOKEN || '';
  const actor = process.env.APIFY_ACTOR || 'apify~instagram-profile-scraper';
  const configured = { graph: !!(token && businessId), apify: !!apify };

  const params = event.queryStringParameters || {};
  const user = clean(params.user || params.q || '');
  const forcar = String(params.fonte || '').toLowerCase();

  if (!user) return reply(200, { ok: true, configured: configured, uso: '/.netlify/functions/instagram?user=perfil&fonte=apify|graph' });

  if (params.foto) {
    try {
      const f = await fotoDePerfil(user, token, businessId);
      return reply(200, { ok: true, user: user, foto: f.foto, nome: f.nome, fonte: f.fonte });
    } catch (e) {
      return reply(200, { ok: false, user: user, reason: 'foto-indisponivel', detalhe: String(e.message || '') });
    }
  }

  if (!configured.graph && !configured.apify) {
    return reply(200, { ok: false, reason: 'sem-integracao', configured: configured, user: user });
  }

  /* O Apify lê qualquer perfil público; a Graph API só contas business ligadas
     ao token. Por isso o Apify vem primeiro quando as duas estão disponíveis. */
  const fila = [];
  if (forcar === 'graph') {
    if (configured.graph) fila.push({ id: 'graph', run: () => viaGraph(token, businessId, user) });
    if (configured.apify) fila.push({ id: 'apify', run: () => viaApify(apify, actor, user) });
  } else {
    if (configured.apify) fila.push({ id: 'apify', run: () => viaApify(apify, actor, user) });
    if (configured.graph) fila.push({ id: 'graph', run: () => viaGraph(token, businessId, user) });
  }

  const erros = [];
  for (const t of fila) {
    try {
      const data = await t.run();
      return reply(200, {
        ok: true, configured: configured, user: user, fonte: t.id,
        dados: data, tentativas: erros.length ? erros : undefined
      });
    } catch (err) {
      erros.push(t.id + ': ' + String((err && err.message) || 'falha'));
    }
  }

  return reply(200, {
    ok: false,
    reason: erros[erros.length - 1] ? erros[erros.length - 1].replace(/^[a-z]+: /, '') : 'falha',
    tentativas: erros, configured: configured, user: user
  });
};
