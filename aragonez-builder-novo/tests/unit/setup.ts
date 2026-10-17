import '@testing-library/jest-dom/vitest';

// o jsdom não tem estas APIs do navegador: versões mínimas para os componentes do editor rodarem nos testes
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window))
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  if (!document.elementsFromPoint) document.elementsFromPoint = () => [];
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!window.matchMedia)
    window.matchMedia = (q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  if (!URL.createObjectURL) {
    let n = 0;
    URL.createObjectURL = () => `blob:teste/${++n}`;
    URL.revokeObjectURL = () => {};
  }
  // document.fonts mínimo: nenhuma fonte conta como carregada (o app avisa a fonte que faltou, sem quebrar)
  if (!document.fonts)
    Object.defineProperty(document, 'fonts', {
      value: Object.assign([], {
        load: async () => [],
        check: () => false,
        ready: Promise.resolve(),
        addEventListener() {},
        removeEventListener() {},
      }),
    });
  // <dialog> modal mínimo: abrir marca "open" (o diálogo fica acessível), fechar tira e avisa com o evento close
  if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  // imagens como no navegador (o jsdom não carrega nenhuma): ao receber um src, a imagem termina de carregar logo
  // depois, dispara 'load' e passa a ter tamanho; src com "quebrado" dispara 'error' e fica sem tamanho
  if (typeof HTMLImageElement !== 'undefined') {
    type Estado = 'carregando' | 'pronta' | 'quebrada';
    const estados = new WeakMap<HTMLImageElement, Estado>();
    const carregar = (img: HTMLImageElement, src: string) => {
      estados.set(img, 'carregando');
      queueMicrotask(() => {
        if (img.getAttribute('src') !== src) return; // trocou de src no meio
        const quebrada = src.includes('quebrado');
        estados.set(img, quebrada ? 'quebrada' : 'pronta');
        img.dispatchEvent(new Event(quebrada ? 'error' : 'load'));
      });
    };
    const proto = HTMLImageElement.prototype;
    const definirAtributo = Element.prototype.setAttribute;
    proto.setAttribute = function (this: HTMLImageElement, nome: string, valor: string) {
      definirAtributo.call(this, nome, valor);
      if (nome === 'src') carregar(this, String(valor));
    };
    const src = Object.getOwnPropertyDescriptor(proto, 'src')!;
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get(this: HTMLImageElement) {
        return src.get!.call(this);
      },
      set(this: HTMLImageElement, v: string) {
        src.set!.call(this, v);
        carregar(this, this.getAttribute('src') ?? '');
      },
    });
    const estado = (img: HTMLImageElement): Estado | undefined => estados.get(img);
    Object.defineProperty(proto, 'complete', {
      configurable: true,
      get(this: HTMLImageElement) {
        return estado(this) !== 'carregando';
      },
    });
    for (const lado of ['naturalWidth', 'naturalHeight'] as const)
      Object.defineProperty(proto, lado, {
        configurable: true,
        get(this: HTMLImageElement) {
          return estado(this) === 'pronta' ? 100 : 0;
        },
      });
    proto.decode = function (this: HTMLImageElement) {
      const fim = () =>
        estado(this) === 'pronta' ? Promise.resolve() : Promise.reject(new DOMException('quebrada', 'EncodingError'));
      if (estado(this) !== 'carregando') return fim();
      return new Promise<void>((ok, falha) => {
        const depois = () => void fim().then(ok, falha);
        this.addEventListener('load', depois, { once: true });
        this.addEventListener('error', depois, { once: true });
      });
    };
  }
  if (!globalThis.CSS?.escape)
    (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s.replace(/["\\]/g, '\\$&'),
    };
}
