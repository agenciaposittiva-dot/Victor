const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5.6-terra',
  anthropic: 'claude-sonnet-5',
  groq: 'llama-3.3-70b-versatile',
  gptoss: 'openai/gpt-oss-120b',
  mistral: 'mistral-large-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
  cohere: 'command-r-plus-08-2024'
};

/* Modelos do Gemini que ficam na camada gratuita (Flash e Flash-Lite).
   Os Pro passaram a ser pagos em 2026 — escolher um deles cobra da conta. */
const GEMINI_FREE = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash', 'gemini-3.1-flash-lite'];

/* Provedores com plano gratuito. O endpoint de todos é compatível com a API
   de chat da OpenAI, por isso usam o mesmo caller. */
/* Nomes de modelo mudam e são descontinuados sem aviso. Cada provedor tem uma
   fila de alternativas, tentadas em ordem quando a conta não reconhece o pedido. */
const COMPAT_FALLBACKS = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'gemma2-9b-it'],
  gptoss: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
  mistral: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'],
  openrouter: ['meta-llama/llama-3.3-70b-instruct:free', 'openai/gpt-oss-120b:free', 'deepseek/deepseek-chat-v3.1:free', 'google/gemma-2-9b-it:free'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', 'meta-llama/Llama-3.1-8B-Instruct-Turbo'],
  cohere: ['command-r-plus-08-2024', 'command-r-08-2024', 'command-r7b-12-2024']
};

const OPENAI_COMPATIBLE = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keys: ['GROQ_API_KEY'], label: 'Groq', free: true },
  /* GPT-OSS: modelo aberto da OpenAI servido pelo Groq. É a única via gratuita
     para um modelo da família GPT — a API paga do ChatGPT não tem camada grátis. */
  gptoss: { url: 'https://api.groq.com/openai/v1/chat/completions', keys: ['GROQ_API_KEY', 'OPENROUTER_API_KEY'], label: 'GPT-OSS (OpenAI aberto)', free: true },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', keys: ['MISTRAL_API_KEY'], label: 'Mistral', free: true },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', keys: ['OPENROUTER_API_KEY'], label: 'OpenRouter', free: true },
  together: { url: 'https://api.together.xyz/v1/chat/completions', keys: ['TOGETHER_API_KEY'], label: 'Together', free: true },
  cohere: { url: 'https://api.cohere.ai/compatibility/v1/chat/completions', keys: ['COHERE_API_KEY'], label: 'Cohere', free: true }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part.text === 'string') return part.text;
    return '';
  }).filter(Boolean).join('\n');
}

function normalizedMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((msg) => ({
    role: msg && (msg.role === 'assistant' || msg.role === 'model') ? 'assistant' : 'user',
    content: textFromContent(msg && msg.content)
  })).filter((msg) => msg.content);
}

function shouldReturnJson(system) {
  return /json válido|somente com json|responda.*json|\{\s*"(?:slides|itens)"/i.test(String(system || ''));
}

function cleanModel(provider, model) {
  const raw = String(model || '').trim();
  if (!raw) return DEFAULT_MODELS[provider];
  if (OPENAI_COMPATIBLE[provider]) return /^[A-Za-z0-9._\/:-]+$/.test(raw) ? raw : DEFAULT_MODELS[provider];
  if (provider === 'gemini' && /^gemini-[a-z0-9.-]+$/i.test(raw)) return raw;
  if (provider === 'openai' && /^(gpt|o)[a-z0-9.-]+$/i.test(raw)) return raw;
  if (provider === 'anthropic' && /^claude-[a-z0-9.-]+$/i.test(raw)) return raw;
  return DEFAULT_MODELS[provider];
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch (_) { data = {}; }
  return { response, data };
}

function extractChatText(data) {
  const choices = data && Array.isArray(data.choices) ? data.choices : [];
  const msg = choices[0] && choices[0].message;
  if (msg && typeof msg.content === 'string') return msg.content.trim();
  if (msg && Array.isArray(msg.content)) return textFromContent(msg.content).trim();
  return '';
}

/* Caller único para Groq, Mistral, OpenRouter, Together e Cohere. */
function makeCompatibleCaller(provider) {
  const cfg = OPENAI_COMPATIBLE[provider];
  return async function (apiKey, model, input) {
    const messages = normalizedMessages(input.messages);
    const list = input.system
      ? [{ role: 'system', content: String(input.system) }].concat(messages)
      : messages.slice();
    if (!messages.length) list.push({ role: 'user', content: 'Responda em português do Brasil.' });

    /* Se o GPT-OSS estiver apontado para o OpenRouter, o id do modelo muda de prefixo. */
    let url = cfg.url;
    let modelId = model;
    if (provider === 'gptoss' && !process.env.GROQ_API_KEY && process.env.OPENROUTER_API_KEY) {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      modelId = 'openai/gpt-oss-120b';
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    if (provider === 'openrouter') headers['X-Title'] = 'Aragonez Builder';

    const alternativas = [modelId].concat((COMPAT_FALLBACKS[provider] || []).filter((m) => m !== modelId));
    let result = null;

    for (const nome of alternativas) {
      const payload = {
        model: nome,
        messages: list,
        max_tokens: Math.max(128, Math.min(Number(input.max_tokens) || 2048, 16000))
      };
      if (typeof input.temperature === 'number') payload.temperature = input.temperature;
      if (shouldReturnJson(input.system) && provider !== 'openrouter') {
        payload.response_format = { type: 'json_object' };
      }

      result = await fetchJson(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (result.response.ok) {
        return { ...result, model: nome, text: extractChatText(result.data) };
      }
      const st = result.response.status;
      const msg = String((result.data && result.data.error && (result.data.error.message || result.data.error)) || '');
      const inexistente = st === 404 || /not found|does not exist|decommission|deprecat|no longer|unsupported|invalid model/i.test(msg);
      if (!inexistente) break;
    }

    return { ...result, text: '' };
  };
}

function extractGeminiText(data) {
  const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates[0] && candidates[0].content && Array.isArray(candidates[0].content.parts)
    ? candidates[0].content.parts : [];
  return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
}

async function callGemini(apiKey, model, input) {
  const contents = normalizedMessages(input.messages).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Responda em português do Brasil.' }] });

  const generationConfig = {
    maxOutputTokens: Math.max(128, Math.min(Number(input.max_tokens) || 2048, 8192))
  };
  if (typeof input.temperature === 'number') generationConfig.temperature = input.temperature;
  if (shouldReturnJson(input.system)) generationConfig.responseMimeType = 'application/json';

  const payload = { contents, generationConfig };
  if (input.system) payload.systemInstruction = { parts: [{ text: String(input.system) }] };

  /* Nem toda conta expõe os mesmos nomes de modelo. Se o escolhido não existir,
     tenta os equivalentes gratuitos antes de devolver erro ao usuário. */
  const candidatos = [model].concat(GEMINI_FREE.filter((m) => m !== model));
  let result = null;

  for (const nome of candidatos) {
    result = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nome)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload)
      }
    );
    if (result.response.ok) {
      return { ...result, model: nome, text: extractGeminiText(result.data) };
    }
    const st = result.response.status;
    const msg = String((result.data && result.data.error && result.data.error.message) || '');
    const inexistente = st === 404 || /not found|is not supported|não está disponível/i.test(msg);
    if (!inexistente) break;
  }

  return { ...result, text: '' };
}

function extractOpenAIText(data) {
  if (data && typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = data && Array.isArray(data.output) ? data.output : [];
  const chunks = [];
  for (const item of output) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

async function callOpenAI(apiKey, model, input) {
  const messages = normalizedMessages(input.messages);
  const payload = {
    model,
    instructions: String(input.system || ''),
    input: messages.length ? messages : [{ role: 'user', content: 'Responda em português do Brasil.' }],
    max_output_tokens: Math.max(128, Math.min(Number(input.max_tokens) || 2048, 16000)),
    reasoning: { effort: 'none' },
    store: false
  };
  if (shouldReturnJson(input.system)) payload.text = { format: { type: 'json_object' } };

  const result = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  return { ...result, text: result.response.ok ? extractOpenAIText(result.data) : '' };
}

function extractAnthropicText(data) {
  const content = data && Array.isArray(data.content) ? data.content : [];
  return content.map((part) => part && part.type === 'text' && typeof part.text === 'string' ? part.text : '').join('').trim();
}

async function callAnthropic(apiKey, model, input) {
  const messages = normalizedMessages(input.messages);
  const payload = {
    model,
    max_tokens: Math.max(128, Math.min(Number(input.max_tokens) || 2048, 16000)),
    messages: messages.length ? messages : [{ role: 'user', content: 'Responda em português do Brasil.' }]
  };
  if (input.system) payload.system = String(input.system);

  const result = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });
  return { ...result, text: result.response.ok ? extractAnthropicText(result.data) : '' };
}

function providerConfig(provider) {
  const compat = OPENAI_COMPATIBLE[provider];
  if (compat) {
    const found = compat.keys.filter((k) => process.env[k]);
    return {
      key: found.length ? process.env[found[0]] : undefined,
      keyName: compat.keys.join(' ou '),
      label: compat.label,
      caller: makeCompatibleCaller(provider)
    };
  }
  if (provider === 'openai') return {
    key: process.env.OPENAI_API_KEY,
    keyName: 'OPENAI_API_KEY',
    label: 'OpenAI',
    caller: callOpenAI
  };
  if (provider === 'anthropic') return {
    key: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    keyName: 'ANTHROPIC_API_KEY',
    label: 'Claude',
    caller: callAnthropic
  };
  return {
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    keyName: 'GEMINI_API_KEY',
    label: 'Gemini',
    caller: callGemini
  };
}

function knownProvider(p) {
  return p === 'openai' || p === 'anthropic' || p === 'gemini' || !!OPENAI_COMPATIBLE[p];
}

function upstreamMessage(data) {
  if (!data) return '';
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (data.error && typeof data.error === 'string') return data.error;
  if (typeof data.message === 'string') return data.message;
  return '';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'GET') {
    const configured = {
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
    };
    const gratuitas = {};
    Object.keys(OPENAI_COMPATIBLE).forEach((p) => {
      const has = OPENAI_COMPATIBLE[p].keys.some((k) => Boolean(process.env[k]));
      configured[p] = has;
      gratuitas[p] = { label: OPENAI_COMPATIBLE[p].label, variavel: OPENAI_COMPATIBLE[p].keys[0], configurada: has };
    });
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    let geminiModelos = null;
    if (key && (event.queryStringParameters || {}).modelos === '1') {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key));
        const d = await r.json();
        geminiModelos = ((d.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
          .map((m) => String(m.name || '').replace('models/', '')));
      } catch (e) { geminiModelos = ['erro ao consultar: ' + String(e && e.message)]; }
    }
    return json(200, { ok: true, configured, gratuitas, defaults: DEFAULT_MODELS, geminiGratis: GEMINI_FREE, geminiModelos });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'Requisição inválida.' }); }

  const provider = knownProvider(input.provider) ? input.provider : 'gemini';
  const envModel = {
    openai: 'OPENAI_MODEL', anthropic: 'ANTHROPIC_MODEL', gemini: 'GEMINI_MODEL',
    groq: 'GROQ_MODEL', mistral: 'MISTRAL_MODEL', openrouter: 'OPENROUTER_MODEL',
    together: 'TOGETHER_MODEL', cohere: 'COHERE_MODEL', gptoss: 'GPTOSS_MODEL'
  }[provider];
  const model = cleanModel(provider, input.model || process.env[envModel]);
  const cfg = providerConfig(provider);

  if (!cfg.key) {
    return json(500, {
      error: `${cfg.keyName} não está configurada no Netlify para a IA selecionada.`,
      code: 'MISSING_AI_API_KEY',
      provider,
      model
    });
  }

  let result;
  try {
    result = await cfg.caller(cfg.key, model, input);
  } catch (networkError) {
    return json(502, {
      error: `Não foi possível conectar à API de ${cfg.label}.`,
      code: 'AI_NETWORK_ERROR',
      provider,
      model
    });
  }

  if (result.response.ok) {
    if (!result.text) {
      return json(502, {
        error: 'A IA respondeu sem conteúdo de texto.',
        code: 'EMPTY_AI_RESPONSE',
        provider,
        model
      });
    }
    return json(200, { text: result.text, provider, model });
  }

  const status = result.response.status || 502;
  const detail = upstreamMessage(result.data);
  if (status === 401 || status === 403) {
    return json(status, {
      error: `A chave ${cfg.keyName} foi recusada pela API. Confira a chave e as permissões da conta.`,
      code: 'AI_AUTH_ERROR', provider, model, detail
    });
  }
  if (status === 429) {
    return json(429, {
      error: 'A cota/limite da IA selecionada foi atingido.',
      code: 'AI_RATE_LIMIT', provider, model, detail
    });
  }
  if (status === 404) {
    const dica = provider === 'gemini'
      ? ` Tentei também: ${GEMINI_FREE.join(', ')}. Verifique se a chave é do Google AI Studio (aistudio.google.com) e se a Generative Language API está ativa no projeto.`
      : (COMPAT_FALLBACKS[provider]
        ? ` Tentei também: ${COMPAT_FALLBACKS[provider].join(', ')}. Abra /api/ai?modelos=1 para ver o que a sua chave enxerga, ou escolha outro provedor em Configurações.`
        : ' Selecione outro modelo no Builder.');
    return json(404, {
      error: `O modelo ${model} não está disponível nessa conta/API.${dica}`,
      code: 'AI_MODEL_NOT_FOUND', provider, model, detail
    });
  }

  return json(status >= 400 && status < 600 ? status : 502, {
    error: detail || 'A API da IA selecionada retornou um erro.',
    code: 'AI_UPSTREAM_ERROR', provider, model
  });
};
