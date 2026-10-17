import { aplicarOverrides } from './componentes';
import { posicaoNaFaixa } from './faixa';
import type { Camada, Fundo, Layout, Projeto, SlideDoProjeto, TipoDeSlide, ValorCampo } from './schemas';

/** Slide pronto para desenhar: tipo, fundo e camadas já com o conteúdo e os ajustes do projeto.
 *  Precedência: ajuste do projeto > conteúdo do projeto > camada do layout > token do Brand Kit (resolvido no render). */
export type SlideMontado = { indice: number; tipo: TipoDeSlide; fundo: Fundo; camadas: Camada[] };

/** Coloca o valor de um campo editável dentro da camada (texto ou imagem). */
export function aplicarConteudo(c: Camada, valor: ValorCampo | undefined): Camada {
  if (valor === undefined) return c;
  if (c.tipo === 'texto') return typeof valor === 'string' ? { ...c, texto: valor } : c;
  if (c.tipo === 'imagem' || c.tipo === 'logo') {
    if (typeof valor === 'string') return { ...c, url: valor };
    return {
      ...c,
      ...(valor.url !== undefined && { url: valor.url }),
      ...(valor.assetId !== undefined && { assetId: valor.assetId }),
      ...(valor.foco && { foco: valor.foco }),
      ...(valor.zoom && { zoom: valor.zoom }),
    };
  }
  return c;
}

function comConteudo(camadas: Camada[], conteudo: Record<string, ValorCampo>): Camada[] {
  return camadas.map((c) => {
    const nova = aplicarConteudo(c, conteudo[c.id]);
    return nova.tipo === 'grupo' ? { ...nova, filhos: comConteudo(nova.filhos, conteudo) } : nova;
  });
}

export function tipoDoLayout(layout: Layout, tipoId: string): TipoDeSlide {
  return layout.tiposDeSlide.find((t) => t.id === tipoId) ?? (layout.tiposDeSlide[0] as TipoDeSlide);
}

export function montarSlide(
  layout: Layout,
  slide: Pick<SlideDoProjeto, 'tipoId' | 'conteudo' | 'overrides'>,
  indice = 0,
): SlideMontado {
  const tipo = tipoDoLayout(layout, slide.tipoId);
  const camadas = aplicarOverrides(comConteudo(tipo.camadas, slide.conteudo ?? {}), slide.overrides);
  return { indice, tipo, fundo: tipo.fundo, camadas };
}

/** Todos os slides do projeto (ou um slide de cada tipo, quando não há projeto: útil para miniaturas do layout). */
export function montarSlides(layout: Layout, projeto?: Pick<Projeto, 'slides'>): SlideMontado[] {
  const slides =
    projeto?.slides ?? layout.tiposDeSlide.map((t) => ({ id: t.id, tipoId: t.id, conteudo: {}, overrides: {} }));
  return slides.map((s, i) => montarSlide(layout, s, i));
}

/** Camadas da faixa contínua já posicionadas para N slides (âncoras e "estica" resolvidos). */
export function camadasDaFaixa(
  layout: Layout,
  n: number,
  overrides?: Record<string, Record<string, unknown>>,
): Camada[] {
  if (!layout.continuo || !layout.faixa) return [];
  return aplicarOverrides(layout.faixa.camadas, overrides).map((c) => posicaoNaFaixa(c, n, layout.formato.w));
}

/** Campos do Modo Conteúdo de um tipo de slide: as camadas marcadas como editáveis, na ordem. */
export function camposEditaveis(tipo: TipoDeSlide): Camada[] {
  const r: Camada[] = [];
  const andar = (cs: Camada[]) =>
    cs.forEach((c) => (c.editavel && c.tipo !== 'grupo' ? r.push(c) : c.tipo === 'grupo' && andar(c.filhos)));
  andar(tipo.camadas);
  return r;
}
