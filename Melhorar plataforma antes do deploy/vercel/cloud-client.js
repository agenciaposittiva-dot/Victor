/* Aragonez Builder — ponte com a nuvem.
   Descobre sozinho o caminho da função (Netlify ou Vercel) e guarda o token
   da sessão. Sem banco configurado, tudo devolve ok:false e a plataforma
   segue funcionando no navegador. */
(function () {
  'use strict';

  var CAMINHOS = ['/.netlify/functions/cloud', '/api/cloud'];
  var caminho = null;
  var TOKEN_KEY = 'aragonez-cloud-token';

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* sem armazenamento */ }
  }

  async function descobrir() {
    if (caminho) return caminho;
    for (var i = 0; i < CAMINHOS.length; i++) {
      try {
        var r = await fetch(CAMINHOS[i], { method: 'GET' });
        if (r.ok) {
          var d = await r.json();
          if (d && d.configurado) { caminho = CAMINHOS[i]; return caminho; }
        }
      } catch (e) { /* tenta o próximo */ }
    }
    return null;
  }

  async function status() {
    var c = await descobrir();
    if (!c) return { ok: false, reason: 'sem-funcao' };
    try {
      var r = await fetch(c);
      return await r.json();
    } catch (e) { return { ok: false, reason: 'sem-funcao' }; }
  }

  async function chamar(action, extra) {
    var c = await descobrir();
    if (!c) return { ok: false, reason: 'sem-funcao' };
    var corpo = Object.assign({ action: action, token: token() }, extra || {});
    try {
      var r = await fetch(c, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      return await r.json();
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || 'falha de rede') };
    }
  }

  async function login(user, pass) {
    var d = await chamar('login', { user: user, pass: pass });
    if (d && d.ok && d.token) setToken(d.token);
    return d;
  }

  function logout() { setToken(''); }

  window.AragonezCloud = {
    status: status,
    login: login,
    logout: logout,
    me: function () { return chamar('me'); },
    users: function () { return chamar('users'); },
    create: function (user, pass, admin) { return chamar('create', { user: user, pass: pass, admin: !!admin }); },
    passwd: function (user, pass) { return chamar('passwd', { user: user, pass: pass }); },
    remove: function (user) { return chamar('remove', { user: user }); },
    pull: function (user) { return chamar('pull', user ? { user: user } : {}); },
    push: function (data, user) { return chamar('push', user ? { data: data, user: user } : { data: data }); },
    temToken: function () { return !!token(); },
    /* Mensagens em português para as recusas da função. */
    motivo: function (reason) {
      return ({
        'sem-funcao': 'A função da nuvem não respondeu. Publique o site e tente de novo.',
        'sem-banco': 'A nuvem não está configurada. Cadastre KV_REST_API_URL e KV_REST_API_TOKEN (ou SUPABASE_URL e SUPABASE_SERVICE_KEY) nas variáveis de ambiente.',
        'conta-inexistente': 'Esse usuário não existe na nuvem.',
        'senha-incorreta': 'Senha incorreta.',
        'sessao-invalida': 'Sua sessão expirou. Entre de novo.',
        'sem-permissao': 'Só o administrador pode fazer isso.',
        'conta-existente': 'Já existe uma conta com esse nome.',
        'dados-invalidos': 'Informe o usuário e uma senha de pelo menos 6 caracteres.',
        'senha-curta': 'A senha precisa de pelo menos 6 caracteres.',
        'nao-remove-a-si': 'Você não pode remover a sua própria conta.',
        'sem-dados': 'Não havia nada para enviar.'
      })[reason] || ('Erro da nuvem: ' + reason);
    }
  };
})();
