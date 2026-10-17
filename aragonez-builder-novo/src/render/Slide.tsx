import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { slidesVisiveis } from '@/dominio/faixa';
import { camadasDaFaixa, type SlideMontado } from '@/dominio/montagem';
import type { Layout } from '@/dominio/schemas';
import type { KitTokens } from '@/dominio/tokens';
import { Camadas } from './Camadas';
import { CtxRender, type ContextoRender } from './contexto';
import { Fundo } from './Fundo';

/** Raiz de render: fornece kit, formato e componentes para as camadas. */
export function ProvedorRender({
  layout,
  kit,
  urlDoAsset,
  children,
}: {
  layout: Layout;
  kit: KitTokens;
  urlDoAsset?: ContextoRender['urlDoAsset'];
  children?: ReactNode;
}) {
  return (
    <CtxRender.Provider value={{ kit, formato: layout.formato, componentes: layout.componentes, urlDoAsset }}>
      {children}
    </CtxRender.Provider>
  );
}

/** Um slide em pixels reais (base do formato). O mesmo componente serve para preview, miniatura e exportação. */
export function Slide({ slide, w, h, estilo }: { slide: SlideMontado; w: number; h: number; estilo?: CSSProperties }) {
  return (
    <div
      data-slide={slide.indice}
      data-tipo={slide.tipo.id}
      style={{ position: 'relative', width: w, height: h, overflow: 'hidden', ...estilo }}
    >
      <Fundo fundo={slide.fundo} w={w} h={h} />
      <Camadas camadas={slide.camadas} />
    </div>
  );
}

/** Carrossel contínuo: os slides lado a lado numa faixa de N × w. As camadas de cada slide podem passar
 *  da divisa (não há corte entre slides) e as camadas da faixa atravessam tudo.
 *  "visiveis" limita quais slides são desenhados (a faixa e suas camadas continuam com a largura total). */
export function Faixa({
  layout,
  slides,
  faixaOverrides,
  visiveis,
}: {
  layout: Layout;
  slides: SlideMontado[];
  faixaOverrides?: Record<string, Record<string, unknown>>;
  visiveis?: number[];
}) {
  const { w, h } = layout.formato;
  const n = slides.length;
  const daFaixa = camadasDaFaixa(layout, n, faixaOverrides);
  const abaixo = daFaixa.filter((c) => !c.acima);
  const acima = daFaixa.filter((c) => c.acima);
  const desenhar = visiveis ? slides.filter((s) => visiveis.includes(s.indice)) : slides;
  return (
    <div data-faixa={n} style={{ position: 'relative', width: n * w, height: h, overflow: 'hidden' }}>
      {layout.faixa?.fundo && <Fundo fundo={layout.faixa.fundo} w={n * w} h={h} />}
      {desenhar.map((s) => (
        <div
          key={'f' + s.indice}
          style={{ position: 'absolute', left: s.indice * w, top: 0, width: w, height: h, overflow: 'hidden' }}
        >
          <Fundo fundo={s.fundo} w={w} h={h} />
        </div>
      ))}
      <Camadas camadas={abaixo} />
      {desenhar.map((s) => (
        <div
          key={'c' + s.indice}
          data-slide={s.indice}
          data-tipo={s.tipo.id}
          style={{ position: 'absolute', left: s.indice * w, top: 0, width: w, height: h }}
        >
          <Camadas camadas={s.camadas} />
        </div>
      ))}
      <Camadas camadas={acima} />
    </div>
  );
}

/** Janela de um slide dentro da faixa contínua: é assim que o slide sai no arquivo (mesmo recorte, sem sobra).
 *  Desenha só os slides cujas camadas cruzam a janela (em geral ele e os vizinhos) mais as camadas da faixa:
 *  com 20 slides, cada janela mede poucos slides em vez da faixa inteira. */
export function JanelaDaFaixa({
  layout,
  slides,
  indice,
  faixaOverrides,
}: {
  layout: Layout;
  slides: SlideMontado[];
  indice: number;
  faixaOverrides?: Record<string, Record<string, unknown>>;
}) {
  const { w, h } = layout.formato;
  const visiveis = useMemo(
    () =>
      slidesVisiveis(
        slides.map((s) => s.camadas),
        indice,
        w,
      ),
    [slides, indice, w],
  );
  return (
    <div data-janela={indice} style={{ position: 'relative', width: w, height: h, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -indice * w, top: 0 }}>
        <Faixa layout={layout} slides={slides} faixaOverrides={faixaOverrides} visiveis={visiveis} />
      </div>
    </div>
  );
}

/** Mostra um conteúdo de w×h reduzido (ou ampliado) sem mudar o layout interno: só um transform de escala. */
export function Escala({ escala, w, h, children }: { escala: number; w: number; h: number; children: ReactNode }) {
  return (
    <div style={{ width: w * escala, height: h * escala, overflow: 'hidden', flex: 'none' }}>
      <div style={{ width: w, height: h, transform: `scale(${escala})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}
