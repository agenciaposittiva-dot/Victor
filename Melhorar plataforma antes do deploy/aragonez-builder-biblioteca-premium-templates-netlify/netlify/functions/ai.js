const DEFAULT_MODELS = {
  gemini: 'gemini-3.7-flash',
  openai: 'gpt-5.6-terra',
  anthropic: 'claude-sonnet-5'
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

  const result = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload)
    }
  );
  return { ...result, text: result.response.ok ? extractGeminiText(result.data) : '' };
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
  if (provider === 'openai') return {
    key: process.env.OPENAI_API_KEY,
    keyName: 'OPENAI_API_KEY',
    caller: callOpenAI
  };
  if (provider === 'anthropic') return {
    key: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    keyName: 'ANTHROPIC_API_KEY',
    caller: callAnthropic
  };
  return {
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    keyName: 'GEMINI_API_KEY',
    caller: callGemini
  };
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
    return json(200, {
      ok: true,
      configured: {
        gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
      },
      defaults: DEFAULT_MODELS
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });

  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'Requisição inválida.' }); }

  const provider = input.provider === 'openai' || input.provider === 'anthropic' ? input.provider : 'gemini';
  const model = cleanModel(provider, input.model || process.env[provider === 'openai' ? 'OPENAI_MODEL' : provider === 'anthropic' ? 'ANTHROPIC_MODEL' : 'GEMINI_MODEL']);
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
      error: `Não foi possível conectar à API de ${provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'Claude'}.`,
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
    return json(404, {
      error: `O modelo ${model} não está disponível nessa conta/API. Selecione outro modelo no Builder.`,
      code: 'AI_MODEL_NOT_FOUND', provider, model, detail
    });
  }

  return json(status >= 400 && status < 600 ? status : 502, {
    error: detail || 'A API da IA selecionada retornou um erro.',
    code: 'AI_UPSTREAM_ERROR', provider, model
  });
};
