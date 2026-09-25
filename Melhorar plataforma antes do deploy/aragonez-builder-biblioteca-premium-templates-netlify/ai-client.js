/* Aragonez Builder — ponte segura entre o navegador e as funções de IA no Netlify. */
(function () {
  'use strict';

  var DEFAULTS = {
    gemini: 'gemini-3.7-flash',
    openai: 'gpt-5.6-terra',
    anthropic: 'claude-sonnet-5'
  };

  function safeGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* storage indisponível */ }
  }

  function normalizeProvider(provider) {
    return provider === 'openai' || provider === 'anthropic' || provider === 'gemini' ? provider : 'gemini';
  }

  function getSelection() {
    var provider = normalizeProvider(safeGet('aragonez-ai-provider') || 'gemini');
    var model = safeGet('aragonez-ai-model') || DEFAULTS[provider];
    return { provider: provider, model: model };
  }

  function setSelection(provider, model) {
    provider = normalizeProvider(provider);
    model = String(model || DEFAULTS[provider]);
    safeSet('aragonez-ai-provider', provider);
    safeSet('aragonez-ai-model', model);
    window.__ARAGONEZ_AI_SELECTION__ = { provider: provider, model: model };
  }

  function humanMessage(status, data) {
    if (data && data.error) return String(data.error);
    if (status === 401 || status === 403) return 'A chave da IA selecionada foi recusada. Confira a Environment Variable correspondente no Netlify.';
    if (status === 404) return 'A função de IA não foi encontrada no deploy. Faça o deploy deste ZIP completo no Netlify.';
    if (status === 429) return 'O limite/cota da IA selecionada foi atingido. Aguarde um pouco ou confira a sua conta de API.';
    return 'Falha ao conectar com a IA (HTTP ' + status + ').';
  }

  async function complete(options) {
    options = options || {};
    var selection = getSelection();
    // Chamadas antigas do Builder enviavam model=claude-*. A seleção da interface tem prioridade.
    if (options.provider) {
      selection.provider = normalizeProvider(options.provider);
      selection.model = String(options.model || DEFAULTS[selection.provider]);
    }

    var response;
    try {
      response = await fetch('/.netlify/functions/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selection.provider,
          model: selection.model,
          system: options.system || '',
          messages: Array.isArray(options.messages) ? options.messages : [],
          max_tokens: options.max_tokens || 2048,
          temperature: typeof options.temperature === 'number' ? options.temperature : undefined
        })
      });
    } catch (networkError) {
      throw new Error('Não foi possível alcançar a função de IA do Netlify.');
    }

    var data = {};
    try { data = await response.json(); } catch (e) { data = {}; }
    if (!response.ok) throw new Error(humanMessage(response.status, data));
    if (!data || typeof data.text !== 'string' || !data.text.trim()) {
      throw new Error('A IA respondeu sem texto. Tente novamente.');
    }
    window.__ARAGONEZ_AI_LAST__ = { provider: data.provider || selection.provider, model: data.model || selection.model };
    return data.text;
  }

  window.aragonezAI = {
    complete: complete,
    getSelection: getSelection,
    setSelection: setSelection
  };

  // Compatibilidade com o código existente do Builder.
  window.claude = window.claude || {};
  window.claude.complete = complete;
  window.__ARAGONEZ_AI_PROVIDER__ = 'multi-provider-netlify';
  window.__ARAGONEZ_AI_SELECTION__ = getSelection();
})();
