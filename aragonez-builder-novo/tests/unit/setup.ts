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
  if (!globalThis.CSS?.escape)
    (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
      escape: (s: string) => s.replace(/["\\]/g, '\\$&'),
    };
}
