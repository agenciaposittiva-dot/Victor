/* Aragonez Builder — geração de imagem por IA.
   Ponto único de integração. Sem chave configurada a função responde ok:false
   e a interface avisa; nada é simulado.

   Variáveis possíveis no Netlify (Site configuration > Environment variables):
   FREEPIK_API_KEY    Freepik AI (text-to-image)
   STABILITY_API_KEY  Stability AI (Stable Image Core)
   OPENAI_API_KEY     OpenAI Images (gpt-image-1)   — a mesma chave usada em ai.js
*/

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function reply(status, body) {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

const SIZES = {
  '1:1': { w: 1024, h: 1024, openai: '1024x1024', freepik: 'square_1_1' },
  '4:5': { w: 1024, h: 1280, openai: '1024x1536', freepik: 'social_story_9_16' },
  '9:16': { w: 1024, h: 1820, openai: '1024x1536', freepik: 'social_story_9_16' },
  '16:9': { w: 1820, h: 1024, openai: '1536x1024', freepik: 'widescreen_16_9' }
};

async function viaFreepik(key, prompt, aspect) {
  const size = SIZES[aspect] || SIZES['1:1'];
  const r = await fetch('https://api.freepik.com/v1/ai/text-to-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': key },
    body: JSON.stringify({ prompt: prompt, num_images: 1, image: { size: size.freepik } })
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.message || d.error)) || 'freepik ' + r.status);
  const imgs = (d.data || []).map(x => x.base64 || x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('freepik devolveu resposta sem imagem');
  return { provider: 'Freepik', imagens: imgs };
}

async function viaStability(key, prompt, aspect) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  form.append('aspect_ratio', aspect === '4:5' ? '4:5' : (aspect === '9:16' ? '9:16' : (aspect === '16:9' ? '16:9' : '1:1')));
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.message || (d.errors && d.errors[0]))) || 'stability ' + r.status);
  if (!d.image) throw new Error('stability devolveu resposta sem imagem');
  return { provider: 'Stability AI', imagens: [d.image] };
}

async function viaOpenAI(key, prompt, aspect) {
  const size = (SIZES[aspect] || SIZES['1:1']).openai;
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: prompt, size: size, n: 1 })
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && d.error && d.error.message) || 'openai ' + r.status);
  const imgs = (d.data || []).map(x => x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('openai devolveu resposta sem imagem');
  return { provider: 'OpenAI Images', imagens: imgs };
}

/* Gemini (Nano Banana): melhor qualidade entre as opções com camada gratuita,
   usa a MESMA GEMINI_API_KEY do texto e aceita foto de base. */
async function viaGemini(key, prompt, aspect, dataUrl) {
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const parts = [{ text: prompt }];
  if (dataUrl) {
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error('imagem enviada em formato inválido');
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: SIZES[aspect] ? aspect : '1:1' }
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && d.error && d.error.message) || 'gemini ' + r.status);
  const cand = ((d.candidates || [])[0] || {});
  const imgs = (((cand.content || {}).parts) || [])
    .map((p) => (p.inlineData || p.inline_data || {}).data)
    .filter(Boolean);
  if (!imgs.length) {
    const motivo = cand.finishReason || (d.promptFeedback && d.promptFeedback.blockReason);
    throw new Error(motivo ? ('gemini recusou: ' + motivo) : 'gemini devolveu resposta sem imagem');
  }
  return { provider: 'Gemini' + (dataUrl ? ' (foto)' : ''), imagens: imgs };
}

/* Together AI: FLUX.1-schnell tem versão gratuita. */
async function viaTogether(key, prompt, aspect) {
  const size = SIZES[aspect] || SIZES['1:1'];
  const r = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: process.env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell-Free',
      prompt: prompt, width: size.w, height: size.h, n: 1, response_format: 'b64_json'
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.error && (d.error.message || d.error)) ) || 'together ' + r.status);
  const imgs = (d.data || []).map((x) => x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('together devolveu resposta sem imagem');
  return { provider: 'Together FLUX (gratuito)', imagens: imgs };
}

/* Cloudflare Workers AI: cota gratuita diária. */
async function viaCloudflare(token, account, prompt) {
  const model = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(account) + '/ai/run/' + model, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ prompt: prompt })
  });
  const d = await r.json();
  if (!r.ok || d.success === false) {
    const e = (d.errors || [])[0];
    throw new Error((e && e.message) || 'cloudflare ' + r.status);
  }
  const b64 = (d.result && (d.result.image || d.result.images && d.result.images[0])) || '';
  if (!b64) throw new Error('cloudflare devolveu resposta sem imagem');
  return { provider: 'Cloudflare FLUX (gratuito)', imagens: [b64] };
}

/* Nebius: crédito gratuito inicial, serve FLUX. */
async function viaNebius(key, prompt, aspect) {
  const size = SIZES[aspect] || SIZES['1:1'];
  const r = await fetch('https://api.studio.nebius.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: process.env.NEBIUS_IMAGE_MODEL || 'black-forest-labs/flux-schnell',
      prompt: prompt, width: size.w, height: size.h, response_format: 'b64_json'
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && d.error && (d.error.message || d.error)) || 'nebius ' + r.status);
  const imgs = (d.data || []).map((x) => x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('nebius devolveu resposta sem imagem');
  return { provider: 'Nebius FLUX', imagens: imgs };
}

/* Hugging Face Inference API: plano gratuito com chave. */
async function viaHuggingFace(key, prompt, aspect) {
  const model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';
  const size = SIZES[aspect] || SIZES['1:1'];
  const r = await fetch('https://api-inference.huggingface.co/models/' + model, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ inputs: prompt, parameters: { width: size.w, height: size.h } })
  });
  if (!r.ok) {
    let msg = 'huggingface ' + r.status;
    try { const d = await r.json(); if (d && d.error) msg = String(d.error); } catch (e) { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error('huggingface devolveu resposta vazia');
  return { provider: 'Hugging Face (gratuito)', imagens: [buf.toString('base64')] };
}

/* Pintar e descrever: a máscara marca o que deve ser refeito. */
async function stabilityInpaint(key, prompt, dataUrl, maskUrl) {
  var img = dataUrlToBlob(dataUrl);
  var msk = dataUrlToBlob(maskUrl);
  var form = new FormData();
  form.append('image', img.blob, 'base.png');
  form.append('mask', msk.blob, 'mask.png');
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.message || (d.errors && d.errors[0]))) || 'stability inpaint ' + r.status);
  if (!d.image) throw new Error('stability devolveu resposta sem imagem');
  return { provider: 'Stability (pintar e descrever)', imagens: [d.image] };
}

async function openaiInpaint(key, prompt, dataUrl, maskUrl, aspect) {
  var img = dataUrlToBlob(dataUrl);
  var msk = dataUrlToBlob(maskUrl);
  var form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', img.blob, 'base.png');
  form.append('mask', msk.blob, 'mask.png');
  form.append('prompt', prompt);
  form.append('size', (SIZES[aspect] || SIZES['1:1']).openai);
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && d.error && d.error.message) || 'openai inpaint ' + r.status);
  const imgs = (d.data || []).map((x) => x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('openai devolveu resposta sem imagem');
  return { provider: 'OpenAI (pintar e descrever)', imagens: imgs };
}

/* Acabamento de estúdio: aumenta resolução e nitidez. */
async function stabilityUpscale(key, dataUrl, prompt) {
  var img = dataUrlToBlob(dataUrl);
  var form = new FormData();
  form.append('image', img.blob, 'base.png');
  form.append('prompt', prompt || 'sharp professional finish, high detail');
  form.append('output_format', 'png');
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/upscale/conservative', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.message || (d.errors && d.errors[0]))) || 'stability upscale ' + r.status);
  if (!d.image) throw new Error('stability devolveu resposta sem imagem');
  return { provider: 'Stability (acabamento de estúdio)', imagens: [d.image] };
}

function dataUrlToBlob(dataUrl) {
  var s = String(dataUrl || '');
  var m = s.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error('imagem enviada em formato inválido');
  var bin = Buffer.from(m[2], 'base64');
  return { blob: new Blob([bin], { type: m[1] }), mime: m[1] };
}

async function stabilityFromPhoto(key, prompt, dataUrl, strength) {
  var img = dataUrlToBlob(dataUrl);
  var form = new FormData();
  form.append('image', img.blob, 'base.png');
  form.append('prompt', prompt);
  form.append('mode', 'image-to-image');
  form.append('strength', String(Math.min(0.95, Math.max(0.15, Number(strength) || 0.6))));
  form.append('output_format', 'png');
  form.append('model', 'sd3.5-large');
  const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && (d.message || (d.errors && d.errors[0]))) || 'stability ' + r.status);
  if (!d.image) throw new Error('stability devolveu resposta sem imagem');
  return { provider: 'Stability AI (foto)', imagens: [d.image] };
}

async function openaiFromPhoto(key, prompt, dataUrl, aspect) {
  var img = dataUrlToBlob(dataUrl);
  var size = (SIZES[aspect] || SIZES['1:1']).openai;
  var form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', img.blob, 'base.png');
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', '1');
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: form
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d && d.error && d.error.message) || 'openai ' + r.status);
  const imgs = (d.data || []).map(x => x.b64_json).filter(Boolean);
  if (!imgs.length) throw new Error('openai devolveu resposta sem imagem');
  return { provider: 'OpenAI Images (foto)', imagens: imgs };
}

exports.handler = async (event) => {
  const freepik = process.env.FREEPIK_API_KEY || '';
  const stability = process.env.STABILITY_API_KEY || '';
  const openai = process.env.OPENAI_API_KEY || '';
  const hf = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || '';
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const together = process.env.TOGETHER_API_KEY || '';
  const nebius = process.env.NEBIUS_API_KEY || '';
  const cfToken = process.env.CF_API_TOKEN || '';
  const cfAccount = process.env.CF_ACCOUNT_ID || '';
  const cloudflare = !!(cfToken && cfAccount);
  const configured = {
    gemini: !!gemini, together: !!together, cloudflare: cloudflare, nebius: !!nebius, huggingface: !!hf,
    freepik: !!freepik, stability: !!stability, openai: !!openai
  };
  const gratuitas = {
    gemini: { label: 'Gemini Nano Banana', chave: 'GEMINI_API_KEY', disponivel: !!gemini },
    together: { label: 'Together FLUX', chave: 'TOGETHER_API_KEY', disponivel: !!together },
    cloudflare: { label: 'Cloudflare FLUX', chave: 'CF_API_TOKEN + CF_ACCOUNT_ID', disponivel: cloudflare },
    nebius: { label: 'Nebius FLUX', chave: 'NEBIUS_API_KEY', disponivel: !!nebius },
    huggingface: { label: 'Hugging Face', chave: 'HF_API_KEY', disponivel: !!hf }
  };

  if ((event.httpMethod || 'GET') === 'GET') {
    return reply(200, { ok: true, configured: configured, gratuitas: gratuitas, uso: 'POST { prompt, aspect, style, provider }' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }

  const prompt = String(body.prompt || '').trim().slice(0, 1200);
  if (!prompt) return reply(400, { ok: false, reason: 'prompt-vazio', configured: configured });

  const aspect = SIZES[body.aspect] ? body.aspect : '1:1';
  const style = String(body.style || '').trim().slice(0, 120);
  const full = style ? (prompt + ' — style: ' + style) : prompt;
  const provider = String(body.provider || '').toLowerCase();
  const photo = String(body.image || '');
  const mask = String(body.mask || '');
  const modo = String(body.mode || '').toLowerCase();
  const lote = Math.max(1, Math.min(4, Number(body.batch) || 1));

  /* Pintar e descrever */
  if (modo === 'inpaint') {
    if (!photo || !mask) return reply(400, { ok: false, reason: 'inpaint-sem-mascara', configured: configured });
    const podeInpaint = { stability: !!stability, openai: !!openai };
    if (provider && !podeInpaint[provider]) {
      return reply(200, {
        ok: false, reason: 'inpaint-provedor-indisponivel', provider: provider,
        variavel: provider === 'openai' ? 'OPENAI_API_KEY' : 'STABILITY_API_KEY',
        disponiveis: Object.keys(podeInpaint).filter((k) => podeInpaint[k]), configured: configured
      });
    }
    if (!stability && !openai) return reply(200, { ok: false, reason: 'inpaint-sem-suporte', configured: configured });
    try {
      const usar = provider || (stability ? 'stability' : 'openai');
      const out = usar === 'stability'
        ? await stabilityInpaint(stability, full, photo, mask)
        : await openaiInpaint(openai, full, photo, mask, aspect);
      return reply(200, { ok: true, configured: configured, provider: out.provider, imagens: out.imagens });
    } catch (err) {
      return reply(200, { ok: false, reason: String((err && err.message) || 'falha'), provider: provider || '', configured: configured });
    }
  }

  /* Acabamento de estúdio */
  if (modo === 'upscale') {
    if (!photo) return reply(400, { ok: false, reason: 'upscale-sem-imagem', configured: configured });
    if (!stability) return reply(200, { ok: false, reason: 'upscale-sem-suporte', configured: configured });
    try {
      const out = await stabilityUpscale(stability, photo, prompt);
      return reply(200, { ok: true, configured: configured, provider: out.provider, imagens: out.imagens });
    } catch (err) {
      return reply(200, { ok: false, reason: String((err && err.message) || 'falha'), configured: configured });
    }
  }

  /* Cada provedor disponível virou uma tentativa. Se um falhar por cota,
     crédito ou indisponibilidade, o próximo assume automaticamente. */
  const tentativasTexto = [
    gemini && { id: 'gemini', run: () => viaGemini(gemini, full, aspect, '') },
    together && { id: 'together', run: () => viaTogether(together, full, aspect) },
    cloudflare && { id: 'cloudflare', run: () => viaCloudflare(cfToken, cfAccount, full) },
    nebius && { id: 'nebius', run: () => viaNebius(nebius, full, aspect) },
    hf && { id: 'huggingface', run: () => viaHuggingFace(hf, full, aspect) },
    freepik && { id: 'freepik', run: () => viaFreepik(freepik, full, aspect) },
    stability && { id: 'stability', run: () => viaStability(stability, full, aspect) },
    openai && { id: 'openai', run: () => viaOpenAI(openai, full, aspect) }
  ].filter(Boolean);

  const tentativasFoto = [
    gemini && { id: 'gemini', run: () => viaGemini(gemini, full, aspect, photo) },
    stability && { id: 'stability', run: () => stabilityFromPhoto(stability, full, photo, body.strength) },
    openai && { id: 'openai', run: () => openaiFromPhoto(openai, full, photo, aspect) }
  ].filter(Boolean);

  const fila = photo ? tentativasFoto : tentativasTexto;

  if (!fila.length) {
    return reply(200, { ok: false, reason: photo ? 'foto-sem-suporte' : 'sem-chave', configured: configured });
  }

  /* O escolhido manda. Se o usuário pediu um provedor específico, a função
     NÃO troca por outro em silêncio: ou entrega com ele, ou diz o que falta. */
  if (provider) {
    const escolhido = fila.filter((t) => t.id === provider)[0];
    if (!escolhido) {
      const nomes = {
        gemini: 'GEMINI_API_KEY', together: 'TOGETHER_API_KEY', nebius: 'NEBIUS_API_KEY',
        huggingface: 'HF_API_KEY', freepik: 'FREEPIK_API_KEY', stability: 'STABILITY_API_KEY',
        openai: 'OPENAI_API_KEY', cloudflare: 'CF_API_TOKEN + CF_ACCOUNT_ID'
      };
      return reply(200, {
        ok: false,
        reason: 'provedor-indisponivel',
        provider: provider,
        variavel: nomes[provider] || provider,
        aceitaFoto: photo ? false : undefined,
        disponiveis: fila.map((t) => t.id),
        configured: configured
      });
    }
    try {
      const out = await escolhido.run();
      let imagens = out.imagens;
      if (lote > 1 && !photo) {
        const extras = await Promise.all(
          Array.from({ length: lote - 1 }, () =>
            escolhido.run().then((r2) => r2.imagens[0]).catch(() => null))
        );
        imagens = imagens.concat(extras.filter(Boolean));
      }
      return reply(200, {
        ok: true, configured: configured, aspect: aspect,
        provider: out.provider, imagens: imagens, escolhido: provider
      });
    } catch (err) {
      return reply(200, {
        ok: false,
        reason: String((err && err.message) || 'falha'),
        provider: provider,
        disponiveis: fila.filter((t) => t.id !== provider).map((t) => t.id),
        configured: configured
      });
    }
  }

  const ordenada = fila;

  const erros = [];
  for (let i = 0; i < ordenada.length; i++) {
    const t = ordenada[i];
    try {
      const out = await t.run();
      /* Variações: repete o mesmo provedor com sementes diferentes. */
      let imagens = out.imagens;
      if (lote > 1 && !photo) {
        const extras = await Promise.all(
          Array.from({ length: lote - 1 }, () =>
            t.run().then((r2) => r2.imagens[0]).catch(() => null))
        );
        imagens = imagens.concat(extras.filter(Boolean));
      }
      return reply(200, {
        ok: true, configured: configured, aspect: aspect,
        provider: out.provider, imagens: imagens,
        tentativas: erros.length ? erros : undefined
      });
    } catch (err) {
      const msg = String((err && err.message) || 'falha');
      erros.push(t.id + ': ' + msg);
      /* Moderação e prompt inválido não melhoram trocando de provedor. */
      if (/moderation|flagged|safety|content.?polic|prompt-vazio|formato inválido/i.test(msg)) break;
    }
  }

  return reply(200, {
    ok: false,
    reason: erros[erros.length - 1] ? erros[erros.length - 1].replace(/^[a-z]+: /, '') : 'falha',
    tentativas: erros,
    configured: configured
  });
};
