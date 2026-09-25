/* Aragonez Builder — galeria de ícones.
   Glifos desenhados em viewBox 0 0 64 64, agrupados por tema.
   Usados no selo de chamada e como camada solta no card. */
(function () {
  'use strict';

  var ICONS = {
    'Setas e navegação': {
      'seta-direita': '<path d="M12 32h34l-11-11 3-3 15 14-15 14-3-3 11-11H12z"/>',
      'seta-cima': '<path d="M32 12l14 15-3 3-11-11v33h-4V19l-11 11-3-3z"/>',
      'seta-curva': '<path d="M18 44c0-14 10-22 24-22" fill="none" stroke-width="4"/><path d="M36 14l10 8-10 8z"/>',
      'toque': '<path d="M28 12a4 4 0 018 0v18l6 3c4 2 5 6 4 10l-2 9H26l-8-14c-2-4 2-8 6-5l4 3z" fill="none" stroke-width="3.4"/>',
      'arrasta': '<path d="M8 32h14M42 32h14" stroke-width="4" fill="none"/><path d="M22 24l-8 8 8 8zM42 24l8 8-8 8z"/>',
      'play': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><path d="M27 22l17 10-17 10z"/>'
    },
    'Sinais e status': {
      'check': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><path d="M21 33l8 8 15-17" fill="none" stroke-width="4.6"/>',
      'x-circulo': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><path d="M23 23l18 18M41 23L23 41" fill="none" stroke-width="4.4"/>',
      'alerta': '<path d="M32 10l24 42H8z" fill="none" stroke-width="4"/><path d="M32 24v14" stroke-width="4.4" fill="none"/><circle cx="32" cy="44" r="2.6"/>',
      'info': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><circle cx="32" cy="21" r="2.8"/><path d="M32 29v16" stroke-width="4.2" fill="none"/>',
      'interrogacao': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><path d="M25 25a7 7 0 0114 1c0 5-7 5-7 11" fill="none" stroke-width="4"/><circle cx="32" cy="45" r="2.6"/>',
      'estrela': '<path d="M32 10l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"/>'
    },
    'Negócios': {
      'grafico-sobe': '<path d="M10 44l12-12 8 7 14-16" fill="none" stroke-width="4.4"/><path d="M36 21h12v12" fill="none" stroke-width="4.4"/>',
      'barras': '<rect x="12" y="34" width="9" height="16"/><rect x="27" y="24" width="9" height="26"/><rect x="42" y="14" width="9" height="36"/>',
      'alvo': '<circle cx="32" cy="32" r="20" fill="none" stroke-width="4"/><circle cx="32" cy="32" r="11" fill="none" stroke-width="4"/><circle cx="32" cy="32" r="3.4"/>',
      'dinheiro': '<rect x="8" y="18" width="48" height="28" rx="4" fill="none" stroke-width="4"/><circle cx="32" cy="32" r="7" fill="none" stroke-width="3.6"/>',
      'aperto': '<path d="M8 34l10-8 8 5 8-5 10 8-8 12H16z" fill="none" stroke-width="3.6"/>',
      'foguete': '<path d="M32 8c9 6 13 16 13 26l-6 6H25l-6-6c0-10 4-20 13-26z" fill="none" stroke-width="3.6"/><circle cx="32" cy="26" r="4.4"/><path d="M25 46l-4 10 8-4M39 46l4 10-8-4"/>'
    },
    'Comunicação': {
      'balao': '<path d="M10 18h44v26H34l-12 10V44H10z" fill="none" stroke-width="4"/>',
      'megafone': '<path d="M12 26h12l20-12v36L24 38H12z" fill="none" stroke-width="3.6"/><path d="M48 24c5 4 5 12 0 16" fill="none" stroke-width="3.4"/>',
      'coracao': '<path d="M32 52C14 40 8 32 8 24a11 11 0 0124-7 11 11 0 0124 7c0 8-6 16-24 28z"/>',
      'sino': '<path d="M32 10a12 12 0 0112 12c0 12 4 14 4 18H16c0-4 4-6 4-18a12 12 0 0112-12z" fill="none" stroke-width="3.6"/><path d="M26 46a6 6 0 0012 0" fill="none" stroke-width="3.4"/>',
      'usuarios': '<circle cx="24" cy="24" r="8" fill="none" stroke-width="3.6"/><path d="M10 50c0-8 6-13 14-13s14 5 14 13" fill="none" stroke-width="3.6"/><circle cx="45" cy="26" r="6" fill="none" stroke-width="3.4"/><path d="M40 50c0-7 4-10 9-10s9 3 9 10" fill="none" stroke-width="3.4"/>',
      'email': '<rect x="8" y="16" width="48" height="32" rx="4" fill="none" stroke-width="4"/><path d="M8 20l24 16 24-16" fill="none" stroke-width="4"/>'
    },
    'Tempo e local': {
      'relogio': '<circle cx="32" cy="32" r="22" fill="none" stroke-width="4"/><path d="M32 18v15l11 7" fill="none" stroke-width="4"/>',
      'calendario': '<rect x="10" y="16" width="44" height="38" rx="4" fill="none" stroke-width="4"/><path d="M10 27h44" stroke-width="4" fill="none"/><path d="M22 10v10M42 10v10" stroke-width="4" fill="none"/>',
      'local': '<path d="M32 8c9 0 15 7 15 15 0 12-15 33-15 33S17 35 17 23c0-8 6-15 15-15z" fill="none" stroke-width="3.6"/><circle cx="32" cy="23" r="5.4"/>',
      'raio': '<path d="M36 6L16 36h12l-4 22 20-32H32z"/>',
      'fogo': '<path d="M32 6c10 12 16 16 16 26a16 16 0 01-32 0c0-6 3-9 6-13 2 4 4 5 6 4-1-7 1-12 4-17z" fill="none" stroke-width="3.4"/>',
      'escudo': '<path d="M32 8l20 7v14c0 12-8 21-20 27-12-6-20-15-20-27V15z" fill="none" stroke-width="3.8"/><path d="M23 32l7 7 13-14" fill="none" stroke-width="4"/>'
    },
    'Objetos': {
      'lampada': '<path d="M32 10a14 14 0 019 25v6H23v-6a14 14 0 019-25z" fill="none" stroke-width="3.6"/><path d="M26 48h12M28 55h8" stroke-width="3.6" fill="none"/>',
      'chave': '<circle cx="22" cy="26" r="10" fill="none" stroke-width="3.8"/><path d="M29 33l19 19M42 46l6-6M48 40l6 6" stroke-width="3.8" fill="none"/>',
      'carrinho': '<path d="M12 14h8l6 24h24" fill="none" stroke-width="3.8"/><path d="M26 26h26l-4 12H26" fill="none" stroke-width="3.4"/><circle cx="30" cy="50" r="4"/><circle cx="48" cy="50" r="4"/>',
      'presente': '<rect x="10" y="24" width="44" height="28" rx="3" fill="none" stroke-width="3.8"/><path d="M10 34h44M32 24v28" stroke-width="3.6" fill="none"/><path d="M32 24c-8 0-12-10-4-12 4 1 4 7 4 12zM32 24c8 0 12-10 4-12-4 1-4 7-4 12"/>',
      'documento': '<path d="M16 8h20l12 12v36H16z" fill="none" stroke-width="3.8"/><path d="M36 8v12h12" fill="none" stroke-width="3.6"/><path d="M24 32h16M24 40h16" stroke-width="3.4" fill="none"/>',
      'camera': '<rect x="8" y="20" width="48" height="30" rx="5" fill="none" stroke-width="3.8"/><circle cx="32" cy="35" r="9" fill="none" stroke-width="3.6"/><path d="M22 20l4-6h12l4 6" fill="none" stroke-width="3.4"/>'
    },
    'Formas': {
      'circulo': '<circle cx="32" cy="32" r="20"/>',
      'quadrado': '<rect x="12" y="12" width="40" height="40" rx="4"/>',
      'losango': '<path d="M32 8l24 24-24 24L8 32z"/>',
      'triangulo': '<path d="M32 10l24 42H8z"/>',
      'aspas': '<path d="M14 40c-4 0-6-3-6-7 0-8 6-14 14-16v6c-5 2-8 5-8 9h4c3 0 5 2 5 5s-2 3-5 3zM40 40c-4 0-6-3-6-7 0-8 6-14 14-16v6c-5 2-8 5-8 9h4c3 0 5 2 5 5s-2 3-5 3z"/>',
      'selo': '<path d="M32 6l6 6h8v8l6 6-6 6v8h-8l-6 6-6-6h-8v-8l-6-6 6-6v-8h8z" fill="none" stroke-width="3.4"/>'
    }
  };

  function flat() {
    var out = [];
    Object.keys(ICONS).forEach(function (grupo) {
      Object.keys(ICONS[grupo]).forEach(function (nome) {
        out.push({ group: grupo, name: nome, glyph: ICONS[grupo][nome] });
      });
    });
    return out;
  }

  function dataUrl(glyph, cor) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="' +
      (cor || '#F7B518') + '" stroke="' + (cor || '#F7B518') + '">' + glyph + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  window.AragonezIcons = {
    groups: Object.keys(ICONS),
    byGroup: ICONS,
    all: flat(),
    dataUrl: dataUrl,
    find: function (nome) {
      var achou = flat().filter(function (i) { return i.name === nome; })[0];
      return achou ? achou.glyph : '';
    }
  };
})();
