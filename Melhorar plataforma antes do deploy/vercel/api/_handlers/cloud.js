/* Aragonez Builder — nuvem: contas de acesso e dados por usuário.
   Ponto único de integração. Sem banco configurado responde ok:false e a
   plataforma continua funcionando no navegador, avisando na tela.

   Variáveis no painel do provedor (Netlify ou Vercel):
     KV_REST_API_URL + KV_REST_API_TOKEN     Vercel KV / Upstash Redis (recomendado)
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (mesma coisa, nome do Upstash)
     SUPABASE_URL + SUPABASE_SERVICE_KEY     alternativa (tabela aragonez_kv)
     ARAGONEZ_ADMIN        usuário do administrador (padrão: victor)
     ARAGONEZ_ADMIN_PASS   senha inicial do administrador (obrigatória para criar contas)

   Rotas (POST, body JSON com "action"):
     login    { user, pass }              -> { token, user, admin }
     me       { token }                   -> { user, admin }
     users    { token }                   -> lista de contas (admin)
     create   { token, user, pass, admin }-> cria conta (admin)
     passwd   { token, user, pass }       -> troca senha (admin ou o próprio)
     remove   { token, user }             -> remove conta (admin)
     pull     { token }                   -> devolve o workspace do usuário
     push     { token, data }             -> grava o workspace do usuário
*/

const crypto = require('crypto');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status, body) => ({ statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) });

/* ---------- armazenamento ---------- */

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function sbConfig() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function kvGet(cfg, chave) {
  const r = await fetch(cfg.url + '/get/' + encodeURIComponent(chave), {
    headers: { Authorization: 'Bearer ' + cfg.token }
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  const d = await r.json();
  if (d.result === null || d.result === undefined) return null;
  try { return JSON.parse(d.result); } catch (e) { return d.result; }
}

async function kvSet(cfg, chave, valor) {
  const r = await fetch(cfg.url + '/set/' + encodeURIComponent(chave), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'text/plain' },
    body: JSON.stringify(valor)
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  return true;
}

async function sbGet(cfg, chave) {
  const r = await fetch(cfg.url + '/rest/v1/aragonez_kv?select=value&key=eq.' + encodeURIComponent(chave), {
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }
  });
  if (!r.ok) throw new Error('supabase ' + r.status);
  const d = await r.json();
  return (d && d[0]) ? d[0].value : null;
}

async function sbSet(cfg, chave, valor) {
  const r = await fetch(cfg.url + '/rest/v1/aragonez_kv?on_conflict=key', {
    method: 'POST',
    headers: {
      apikey: cfg.key, Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify([{ key: chave, value: valor }])
  });
  if (!r.ok) {
    let msg = 'supabase ' + r.status;
    try { const d = await r.json(); if (d && d.message) msg = d.message; } catch (e) { /* corpo vazio */ }
    throw new Error(msg);
  }
  return true;
}

function store() {
  const kv = kvConfig();
  if (kv) return { tipo: 'kv', get: (k) => kvGet(kv, k), set: (k, v) => kvSet(kv, k, v) };
  const sb = sbConfig();
  if (sb) return { tipo: 'supabase', get: (k) => sbGet(sb, k), set: (k, v) => sbSet(sb, k, v) };
  return null;
}

/* ---------- senhas e sessão ---------- */

const senhaHash = (pass, salt) =>
  crypto.scryptSync(String(pass), String(salt), 32).toString('hex');

const novoSalt = () => crypto.randomBytes(16).toString('hex');
const novoToken = () => crypto.randomBytes(24).toString('hex');
const limpo = (u) => String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);

const CONTAS = 'aragonez:contas';
const sessaoKey = (t) => 'aragonez:sessao:' + t;
const dadosKey = (u) => 'aragonez:dados:' + u;

async function lerContas(db) {
  const c = await db.get(CONTAS);
  return (c && typeof c === 'object') ? c : {};
}

/* O administrador vem das variáveis de ambiente e é criado no primeiro login. */
async function garantirAdmin(db) {
  const contas = await lerContas(db);
  const nome = limpo(process.env.ARAGONEZ_ADMIN || 'victor');
  const pass = process.env.ARAGONEZ_ADMIN_PASS || '';
  if (!nome || !pass || contas[nome]) return contas;
  const salt = novoSalt();
  contas[nome] = { user: nome, salt, hash: senhaHash(pass, salt), admin: true, criadoEm: new Date().toISOString() };
  await db.set(CONTAS, contas);
  return contas;
}

async function sessao(db, token) {
  if (!token) return null;
  const s = await db.get(sessaoKey(token));
  if (!s || !s.user) return null;
  if (s.exp && Date.now() > s.exp) return null;
  const contas = await lerContas(db);
  const conta = contas[s.user];
  if (!conta) return null;
  return { user: conta.user, admin: !!conta.admin };
}

/* ---------- handler ---------- */

exports.handler = async (event) => {
  const db = store();
  const configurado = {
    kv: !!kvConfig(), supabase: !!sbConfig(),
    adminDefinido: !!(process.env.ARAGONEZ_ADMIN_PASS || '')
  };

  if ((event.httpMethod || 'GET') === 'GET') {
    return reply(200, {
      ok: !!db, configurado,
      backend: db ? db.tipo : '',
      uso: 'POST { action, ... }'
    });
  }

  if (!db) return reply(200, { ok: false, reason: 'sem-banco', configurado });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const action = String(body.action || '');

  try {
    if (action === 'login') {
      const contas = await garantirAdmin(db);
      const user = limpo(body.user);
      const conta = contas[user];
      if (!conta) return reply(200, { ok: false, reason: 'conta-inexistente' });
      if (senhaHash(body.pass, conta.salt) !== conta.hash) {
        return reply(200, { ok: false, reason: 'senha-incorreta' });
      }
      const token = novoToken();
      const dias = 30;
      await db.set(sessaoKey(token), { user: conta.user, exp: Date.now() + dias * 864e5 });
      return reply(200, { ok: true, token, user: conta.user, admin: !!conta.admin });
    }

    if (action === 'me') {
      const s = await sessao(db, body.token);
      if (!s) return reply(200, { ok: false, reason: 'sessao-invalida' });
      return reply(200, { ok: true, user: s.user, admin: s.admin });
    }

    const s = await sessao(db, body.token);
    if (!s) return reply(200, { ok: false, reason: 'sessao-invalida' });

    if (action === 'users') {
      if (!s.admin) return reply(200, { ok: false, reason: 'sem-permissao' });
      const contas = await lerContas(db);
      const lista = Object.keys(contas).map((k) => ({
        user: contas[k].user, admin: !!contas[k].admin, criadoEm: contas[k].criadoEm || ''
      }));
      return reply(200, { ok: true, users: lista });
    }

    if (action === 'create') {
      if (!s.admin) return reply(200, { ok: false, reason: 'sem-permissao' });
      const user = limpo(body.user);
      const pass = String(body.pass || '');
      if (!user || pass.length < 6) return reply(200, { ok: false, reason: 'dados-invalidos' });
      const contas = await lerContas(db);
      if (contas[user]) return reply(200, { ok: false, reason: 'conta-existente' });
      const salt = novoSalt();
      contas[user] = {
        user, salt, hash: senhaHash(pass, salt),
        admin: !!body.admin, criadoEm: new Date().toISOString()
      };
      await db.set(CONTAS, contas);
      return reply(200, { ok: true, user });
    }

    if (action === 'passwd') {
      const user = limpo(body.user) || s.user;
      if (!s.admin && user !== s.user) return reply(200, { ok: false, reason: 'sem-permissao' });
      const pass = String(body.pass || '');
      if (pass.length < 6) return reply(200, { ok: false, reason: 'senha-curta' });
      const contas = await lerContas(db);
      if (!contas[user]) return reply(200, { ok: false, reason: 'conta-inexistente' });
      const salt = novoSalt();
      contas[user] = Object.assign({}, contas[user], { salt, hash: senhaHash(pass, salt) });
      await db.set(CONTAS, contas);
      return reply(200, { ok: true, user });
    }

    if (action === 'remove') {
      if (!s.admin) return reply(200, { ok: false, reason: 'sem-permissao' });
      const user = limpo(body.user);
      if (user === s.user) return reply(200, { ok: false, reason: 'nao-remove-a-si' });
      const contas = await lerContas(db);
      if (!contas[user]) return reply(200, { ok: false, reason: 'conta-inexistente' });
      delete contas[user];
      await db.set(CONTAS, contas);
      return reply(200, { ok: true, user });
    }

    if (action === 'pull') {
      const alvo = (s.admin && body.user) ? limpo(body.user) : s.user;
      const dados = await db.get(dadosKey(alvo));
      return reply(200, { ok: true, user: alvo, data: dados || null });
    }

    if (action === 'push') {
      const alvo = (s.admin && body.user) ? limpo(body.user) : s.user;
      if (!body.data || typeof body.data !== 'object') {
        return reply(200, { ok: false, reason: 'sem-dados' });
      }
      await db.set(dadosKey(alvo), { data: body.data, at: new Date().toISOString() });
      return reply(200, { ok: true, user: alvo, at: new Date().toISOString() });
    }

    return reply(400, { ok: false, reason: 'acao-desconhecida' });
  } catch (err) {
    return reply(200, { ok: false, reason: String((err && err.message) || 'falha'), configurado });
  }
};
