/* Aragonez Builder — camada de persistência com IDs.
   Hoje grava em localStorage. Toda leitura/escrita de dados de negócio passa por aqui,
   para que a migração para banco de dados troque só a implementação de load/save. */
(function () {
  'use strict';

  var KEY_BASE = 'aragonez-db';
  var currentUser = '';
  var VERSION = 2;

  /* Cada login tem o seu próprio espaço: clientes, projetos, demandas e tudo
     mais ficam sob a chave do usuário. Trocar de conta troca o conjunto inteiro. */
  function userKey(u) {
    var nome = String(u == null ? currentUser : u).trim().toLowerCase();
    return nome ? (KEY_BASE + '::' + nome) : KEY_BASE;
  }

  function setUser(u) {
    currentUser = String(u || '').trim().toLowerCase();
    return currentUser;
  }

  function getUser() { return currentUser; }

  var EMPTY = {
    version: VERSION,
    clients: {},            /* clientId  -> cliente + brandKit */
    projects: {},           /* projectId -> { clientId, name, status, createdAt } */
    contents: {},           /* contentId -> { clientId, projectId, format, status, slides } */
    assets: {},             /* assetId   -> { clientId, projectId, type, source, tags, createdAt } */
    topics: {},             /* topicId   -> { clientId, tema, angulo, fonte, data, url } */
    demands: {},            /* demandId  -> demanda com status, prazo, responsável, histórico */
    imageTemplates: {},     /* imgtId    -> arte pronta em imagem, usada como base do slide */
    instagram: {},          /* clientId  -> última análise de perfil */
    intelligence: {},       /* clientId  -> última saída do Radar de marca */
    activeClientId: ''
  };

  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; } }

  function load() {
    var db;
    try { db = JSON.parse(localStorage.getItem(userKey()) || 'null'); } catch (e) { db = null; }
    /* Primeiro acesso deste usuário: aproveita o que estava no espaço antigo,
       sem usuário, para não perder o trabalho de quem já usava a plataforma. */
    if (!db && currentUser) {
      try {
        var antigo = JSON.parse(localStorage.getItem(KEY_BASE) || 'null');
        if (antigo && typeof antigo === 'object' && !antigo.migradoPara) {
          db = antigo;
          antigo.migradoPara = currentUser;
          localStorage.setItem(KEY_BASE, JSON.stringify(antigo));
        }
      } catch (e) { /* espaço antigo ilegível */ }
    }
    if (!db || typeof db !== 'object') db = clone(EMPTY);
    Object.keys(EMPTY).forEach(function (k) {
      if (db[k] === undefined) db[k] = clone(EMPTY[k]);
    });
    db.version = VERSION;
    return db;
  }

  function save(db) {
    try { localStorage.setItem(userKey(), JSON.stringify(db)); } catch (e) { /* cota cheia */ }
    return db;
  }

  function id(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var CLIENT_FIELDS = {
    name: '', logo: '', logoAlt: '', segmento: '', site: '', instagram: '',
    descricao: '', produtos: '', servicos: '', publico: '', regiao: '',
    diferenciais: '', concorrentes: '', cta: '',
    palavrasSim: '', palavrasNao: '', tom: 'Direto e afiado', objetivo: 'Autoridade',
    accent: '#F7B518', bg: '#050403', text: '#FFFFFF',
    font: '', fontDisplay: '', referencias: '', observacoes: ''
  };

  function normalizeClient(c) {
    var out = {};
    Object.keys(CLIENT_FIELDS).forEach(function (k) {
      out[k] = (c && c[k] !== undefined && c[k] !== null) ? c[k] : CLIENT_FIELDS[k];
    });
    out.id = (c && c.id) || id('cli');
    out.createdAt = (c && c.createdAt) || new Date().toISOString();
    out.updatedAt = new Date().toISOString();
    return out;
  }

  function listClients() {
    var db = load();
    return Object.keys(db.clients).map(function (k) { return db.clients[k]; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }

  function getClient(clientId) {
    var db = load();
    return db.clients[clientId] || null;
  }

  function upsertClient(client) {
    var db = load();
    var c = normalizeClient(client);
    db.clients[c.id] = c;
    if (!db.activeClientId) db.activeClientId = c.id;
    save(db);
    return c;
  }

  function removeClient(clientId) {
    var db = load();
    delete db.clients[clientId];
    Object.keys(db.projects).forEach(function (p) { if (db.projects[p].clientId === clientId) delete db.projects[p]; });
    Object.keys(db.contents).forEach(function (p) { if (db.contents[p].clientId === clientId) delete db.contents[p]; });
    delete db.instagram[clientId];
    delete db.intelligence[clientId];
    if (db.activeClientId === clientId) db.activeClientId = Object.keys(db.clients)[0] || '';
    save(db);
    return db.activeClientId;
  }

  function setActiveClient(clientId) {
    var db = load();
    db.activeClientId = clientId || '';
    save(db);
    return db.activeClientId;
  }

  function activeClient() {
    var db = load();
    return db.clients[db.activeClientId] || null;
  }

  function setIntelligence(clientId, data) {
    var db = load();
    if (!clientId) return null;
    db.intelligence[clientId] = { data: data, at: new Date().toISOString() };
    save(db);
    return db.intelligence[clientId];
  }

  function getIntelligence(clientId) {
    var db = load();
    return db.intelligence[clientId] || null;
  }

  function setInstagram(clientId, data) {
    var db = load();
    if (!clientId) return null;
    db.instagram[clientId] = { data: data, at: new Date().toISOString() };
    save(db);
    return db.instagram[clientId];
  }

  function getInstagram(clientId) {
    var db = load();
    return db.instagram[clientId] || null;
  }

  /* Migração dos perfis antigos (aragonez-builder-brands, indexados por nome). */
  function migrateLegacyBrands() {
    var db = load();
    if (Object.keys(db.clients).length) return { migrated: 0, clients: listClients() };
    var legacy = {};
    try { legacy = JSON.parse(localStorage.getItem('aragonez-builder-brands') || '{}') || {}; } catch (e) { legacy = {}; }
    var names = Object.keys(legacy);
    names.forEach(function (name) {
      var b = legacy[name] || {};
      var c = normalizeClient({
        name: name,
        segmento: b.brandNiche || '',
        publico: b.publico || '',
        tom: b.tom || 'Direto e afiado',
        objetivo: b.objetivo || 'Autoridade',
        cta: b.ctaPadrao || '',
        palavrasSim: b.palavrasSim || '',
        palavrasNao: b.palavrasNao || '',
        accent: b.accent || '#F7B518',
        bg: b.bg || '#050403',
        text: b.text || '#FFFFFF',
        font: b.font || '',
        fontDisplay: b.fontDisplay || '',
        logo: b.logoSrc || '',
        instagram: b.handle || ''
      });
      db.clients[c.id] = c;
      if (!db.activeClientId) db.activeClientId = c.id;
    });
    save(db);
    return { migrated: names.length, clients: listClients() };
  }

  /* Campos de marca que o editor e a IA já consomem hoje. */
  function clientToEditorState(c) {
    if (!c) return {};
    return {
      brandName: c.name || '',
      brandNiche: c.segmento || '',
      publico: c.publico || '',
      tom: c.tom || 'Direto e afiado',
      objetivo: c.objetivo || 'Autoridade',
      ctaPadrao: c.cta || '',
      palavrasSim: c.palavrasSim || '',
      palavrasNao: c.palavrasNao || '',
      accent: c.accent || '',
      bg: c.bg || '#050403',
      text: c.text || '#FFFFFF',
      logoSrc: c.logo || '',
      handle: c.instagram || '',
      rxHandle: c.instagram || '',
      rxSite: c.site || ''
    };
  }

  /* ——— Assets ——— */
  function listAssets(clientId) {
    var db = load();
    return Object.keys(db.assets).map(function (k) { return db.assets[k]; })
      .filter(function (a) { return !clientId || a.clientId === clientId || !a.clientId; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  function upsertAsset(asset) {
    var db = load();
    var a = {
      id: (asset && asset.id) || id('ast'),
      clientId: (asset && asset.clientId) || '',
      projectId: (asset && asset.projectId) || '',
      name: (asset && asset.name) || 'arquivo',
      type: (asset && asset.type) || 'upload',
      source: (asset && asset.source) || 'upload',
      tags: (asset && asset.tags) || '',
      url: (asset && asset.url) || '',
      bytes: (asset && asset.bytes) || 0,
      createdAt: (asset && asset.createdAt) || new Date().toISOString()
    };
    db.assets[a.id] = a;
    save(db);
    return a;
  }

  function removeAsset(assetId) {
    var db = load();
    delete db.assets[assetId];
    save(db);
  }

  /* ——— Conteúdos agendados (calendário) ——— */
  function listContents(clientId) {
    var db = load();
    return Object.keys(db.contents).map(function (k) { return db.contents[k]; })
      .filter(function (c) { return !clientId || c.clientId === clientId; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }

  function upsertContent(content) {
    var db = load();
    var c = {
      id: (content && content.id) || id('cnt'),
      clientId: (content && content.clientId) || '',
      projectId: (content && content.projectId) || '',
      title: (content && content.title) || 'Sem título',
      format: (content && content.format) || 'Carrossel',
      status: (content && content.status) || 'Rascunho',
      date: (content && content.date) || new Date().toISOString().slice(0, 10),
      tema: (content && content.tema) || '',
      createdAt: (content && content.createdAt) || new Date().toISOString()
    };
    db.contents[c.id] = c;
    save(db);
    return c;
  }

  function removeContent(contentId) {
    var db = load();
    delete db.contents[contentId];
    save(db);
  }

  var STATUSES = ['Rascunho', 'Em criação', 'Revisão', 'Aprovado', 'Agendado', 'Publicado'];

  /* ——— Pautas ——— */
  function listTopics(clientId) {
    var db = load();
    return Object.keys(db.topics).map(function (k) { return db.topics[k]; })
      .filter(function (t) { return !clientId || t.clientId === clientId; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  function upsertTopic(topic) {
    var db = load();
    var t = {
      id: (topic && topic.id) || id('top'),
      clientId: (topic && topic.clientId) || '',
      tema: (topic && topic.tema) || '',
      angulo: (topic && topic.angulo) || '',
      categoria: (topic && topic.categoria) || '',
      fonte: (topic && topic.fonte) || 'manual',
      status: (topic && topic.status) || 'Ideia',
      createdAt: (topic && topic.createdAt) || new Date().toISOString()
    };
    db.topics[t.id] = t;
    save(db);
    return t;
  }

  function removeTopic(topicId) {
    var db = load();
    delete db.topics[topicId];
    save(db);
  }

  var TOPIC_STATUSES = ['Ideia', 'Aprovada', 'Em produção', 'Feita'];

  /* ——— Backup ——— */
  function exportJson() {
    return JSON.stringify(load(), null, 2);
  }

  function importJson(text) {
    var incoming = JSON.parse(text);
    if (!incoming || typeof incoming !== 'object') throw new Error('arquivo inválido');
    var db = clone(EMPTY);
    Object.keys(EMPTY).forEach(function (k) {
      if (incoming[k] !== undefined) db[k] = incoming[k];
    });
    save(db);
    return db;
  }

  function resetAll() {
    save(clone(EMPTY));
  }

  /* ——— Templates de imagem (arte pronta usada como base do slide) ——— */
  var IMGT_CATEGORIES = ['Fundo', 'Moldura', 'Textura', 'Cenário', 'Produto', 'Pessoas', 'Capa', 'Outro'];

  function listImageTemplates(clientId) {
    var db = load();
    if (!db.imageTemplates) db.imageTemplates = {};
    return Object.keys(db.imageTemplates).map(function (k) { return db.imageTemplates[k]; })
      .filter(function (t) { return !clientId || !t.clientId || t.clientId === clientId; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  function upsertImageTemplate(t) {
    var db = load();
    if (!db.imageTemplates) db.imageTemplates = {};
    var out = {
      id: (t && t.id) || id('imgt'),
      clientId: (t && t.clientId) || '',
      name: (t && t.name) || 'Sem nome',
      url: (t && t.url) || '',
      aspect: (t && t.aspect) || '4:5',
      category: IMGT_CATEGORIES.indexOf(t && t.category) !== -1 ? t.category : 'Fundo',
      tags: (t && t.tags) || '',
      overlay: (t && t.overlay !== undefined) ? Number(t.overlay) : 45,
      layout: (t && t.layout) || 'capa',
      uses: Number(t && t.uses) || 0,
      favorite: !!(t && t.favorite),
      createdAt: (t && t.createdAt) || new Date().toISOString()
    };
    db.imageTemplates[out.id] = out;
    save(db);
    return out;
  }

  function removeImageTemplate(templateId) {
    var db = load();
    if (db.imageTemplates) delete db.imageTemplates[templateId];
    save(db);
  }

  function bumpImageTemplate(templateId) {
    var db = load();
    var t = (db.imageTemplates || {})[templateId];
    if (!t) return null;
    t.uses = (Number(t.uses) || 0) + 1;
    save(db);
    return t;
  }

  /* ——— Demandas (gestão de trabalho) ——— */
  var DEMAND_STATUSES = ['Solicitada', 'Em análise', 'Aprovada', 'Em produção', 'Em revisão', 'Entregue'];
  var DEMAND_PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Urgente'];
  var DEMAND_TYPES = ['Carrossel', 'Post único', 'Stories', 'Anúncio', 'Legenda', 'Identidade', 'Vídeo', 'Site', 'Outro'];

  function normalizeDemand(d) {
    d = d || {};
    return {
      id: d.id || id('dem'),
      clientId: d.clientId || '',
      title: d.title || '',
      brief: d.brief || '',
      type: DEMAND_TYPES.indexOf(d.type) !== -1 ? d.type : 'Carrossel',
      status: DEMAND_STATUSES.indexOf(d.status) !== -1 ? d.status : 'Solicitada',
      priority: DEMAND_PRIORITIES.indexOf(d.priority) !== -1 ? d.priority : 'Normal',
      owner: d.owner || '',
      requester: d.requester || '',
      due: d.due || '',
      quantity: Number(d.quantity) || 1,
      estimate: Number(d.estimate) || 0,
      spent: Number(d.spent) || 0,
      tags: d.tags || '',
      links: d.links || '',
      projectName: d.projectName || '',
      comments: Array.isArray(d.comments) ? d.comments : [],
      history: Array.isArray(d.history) ? d.history : [],
      createdAt: d.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deliveredAt: d.deliveredAt || ''
    };
  }

  function listDemands(clientId) {
    var db = load();
    if (!db.demands) db.demands = {};
    return Object.keys(db.demands).map(function (k) { return db.demands[k]; })
      .filter(function (d) { return !clientId || d.clientId === clientId; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  function getDemand(demandId) {
    var db = load();
    return (db.demands || {})[demandId] || null;
  }

  function upsertDemand(demand, evento) {
    var db = load();
    if (!db.demands) db.demands = {};
    var antigo = demand && demand.id ? db.demands[demand.id] : null;
    var d = normalizeDemand(Object.assign({}, antigo || {}, demand || {}));
    if (antigo && antigo.status !== d.status) {
      d.history = d.history.concat([{ at: new Date().toISOString(), texto: 'Status: ' + antigo.status + ' \u2192 ' + d.status }]);
      if (d.status === 'Entregue' && !d.deliveredAt) d.deliveredAt = new Date().toISOString();
      if (d.status !== 'Entregue') d.deliveredAt = '';
    } else if (!antigo) {
      d.history = [{ at: d.createdAt, texto: 'Demanda criada' }];
    }
    if (evento) d.history = d.history.concat([{ at: new Date().toISOString(), texto: evento }]);
    db.demands[d.id] = d;
    save(db);
    return d;
  }

  function addDemandComment(demandId, autor, texto) {
    var db = load();
    if (!db.demands || !db.demands[demandId]) return null;
    var d = db.demands[demandId];
    d.comments = (d.comments || []).concat([{ at: new Date().toISOString(), autor: autor || 'Equipe', texto: texto }]);
    d.updatedAt = new Date().toISOString();
    db.demands[d.id] = d;
    save(db);
    return d;
  }

  function removeDemand(demandId) {
    var db = load();
    if (db.demands) delete db.demands[demandId];
    save(db);
  }

  window.AragonezStore = {
    setUser: setUser,
    getUser: getUser,
    IMGT_CATEGORIES: IMGT_CATEGORIES,
    listImageTemplates: listImageTemplates,
    upsertImageTemplate: upsertImageTemplate,
    removeImageTemplate: removeImageTemplate,
    bumpImageTemplate: bumpImageTemplate,
    DEMAND_STATUSES: DEMAND_STATUSES,
    DEMAND_PRIORITIES: DEMAND_PRIORITIES,
    DEMAND_TYPES: DEMAND_TYPES,
    listDemands: listDemands,
    getDemand: getDemand,
    upsertDemand: upsertDemand,
    addDemandComment: addDemandComment,
    removeDemand: removeDemand,
    TOPIC_STATUSES: TOPIC_STATUSES,
    listTopics: listTopics,
    upsertTopic: upsertTopic,
    removeTopic: removeTopic,
    exportJson: exportJson,
    importJson: importJson,
    resetAll: resetAll,
    STATUSES: STATUSES,
    listAssets: listAssets,
    upsertAsset: upsertAsset,
    removeAsset: removeAsset,
    listContents: listContents,
    upsertContent: upsertContent,
    removeContent: removeContent,
    VERSION: VERSION,
    CLIENT_FIELDS: CLIENT_FIELDS,
    load: load,
    save: save,
    id: id,
    listClients: listClients,
    getClient: getClient,
    upsertClient: upsertClient,
    removeClient: removeClient,
    setActiveClient: setActiveClient,
    activeClient: activeClient,
    setIntelligence: setIntelligence,
    getIntelligence: getIntelligence,
    setInstagram: setInstagram,
    getInstagram: getInstagram,
    migrateLegacyBrands: migrateLegacyBrands,
    clientToEditorState: clientToEditorState,
    normalizeClient: normalizeClient
  };
})();
