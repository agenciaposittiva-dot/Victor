import { aplicarOverrides } from './componentes';
import { posicaoNaFaixa } from './faixa';
import { garantirIdsUnicos, idsDaArvore } from './ids';
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

export type SlideParaMontar = Pick<SlideDoProjeto, 'tipoId' | 'conteudo' | 'overrides'> &
  Partial<Pick<SlideDoProjeto, 'camadasExtras' | 'ordem' | 'fundo'>>;

/** Reordena camadas pela lista de ids (de baixo para cima); ids fora da lista ficam no fim, na ordem atual. */
export function ordenarCamadas(camadas: Camada[], ordem: string[] | undefined): Camada[] {
  if (!ordem?.length) return camadas;
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return camadas
    .map((c, i) => ({ c, k: pos.get(c.id) ?? ordem.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
}

/** Slide montado: camadas do tipo com o conteúdo e os ajustes do projeto, depois as camadas extras do slide
 *  (elementos que existem só nele), na ordem pedida. */
export function montarSlide(layout: Layout, slide: SlideParaMontar, indice = 0): SlideMontado {
  const tipo = tipoDoLayout(layout, slide.tipoId);
  const doLayout = aplicarOverrides(comConteudo(tipo.camadas, slide.conteudo ?? {}), slide.overrides);
  const camadas = ordenarCamadas([...doLayout, ...extrasSemColisao(doLayout, slide.camadasExtras)], slide.ordem);
  return { indice, tipo, fundo: slide.fundo ?? tipo.fundo, camadas };
}

/** Extra com o mesmo id de uma camada do layout (ex.: o layout ganhou essa camada depois) ganha um id novo e
 *  estável (selo → selo-2): assim os ajustes e o conteúdo da camada do layout não atingem a extra, e editor,
 *  miniaturas e exportação veem as mesmas camadas. O próximo salvamento grava o id novo. */
function extrasSemColisao(doLayout: Camada[], extras: Camada[] | undefined): Camada[] {
  if (!extras?.length) return [];
  return garantirIdsUnicos(extras, idsDaArvore(doLayout));
}

/** Cache por (layout, slide do projeto): o mesmo objeto devolve o mesmo slide montado, então as camadas mantêm
 *  a identidade e os componentes memorizados não redesenham à toa (e o auto-ajuste não mede de novo). */
const cacheMontagem = new WeakMap<Layout, WeakMap<object, SlideMontado>>();

/** Todos os slides do projeto (ou um slide de cada tipo, quando não há projeto: útil para miniaturas do layout). */
export function montarSlides(layout: Layout, projeto?: Pick<Projeto, 'slides'>): SlideMontado[] {
  if (!projeto)
    return layout.tiposDeSlide.map((t, i) => montarSlide(layout, { tipoId: t.id, conteudo: {}, overrides: {} }, i));
  let porSlide = cacheMontagem.get(layout);
  if (!porSlide) cacheMontagem.set(layout, (porSlide = new WeakMap()));
  return projeto.slides.map((s, i) => {
    const salvo = porSlide.get(s);
    if (salvo && salvo.indice === i) return salvo;
    const m = montarSlide(layout, s, i);
    porSlide.set(s, m);
    return m;
  });
}

/** Ajustes do projeto na faixa contínua. */
export type AjustesDaFaixa = Partial<Pick<Projeto, 'faixaOverrides' | 'faixaExtras' | 'faixaOrdem'>>;

/** Camadas da faixa com os ajustes e as extras do projeto, ainda com âncoras e "estica" (como o editor edita). */
export function faixaDoProjeto(layout: Layout, ajustes?: AjustesDaFaixa): Camada[] {
  if (!layout.continuo) return [];
  const base = aplicarOverrides(layout.faixa?.camadas ?? [], ajustes?.faixaOverrides);
  return ordenarCamadas([...base, ...extrasSemColisao(base, ajustes?.faixaExtras)], ajustes?.faixaOrdem);
}

/** Camadas da faixa contínua já posicionadas para N slides (âncoras e "estica" resolvidos). */
export function camadasDaFaixa(layout: Layout, n: number, ajustes?: AjustesDaFaixa): Camada[] {
  return faixaDoProjeto(layout, ajustes).map((c) => posicaoNaFaixa(c, n, layout.formato.w));
}

/** O layout com a faixa do projeto já aplicada (para desenhar e exportar sem repassar os ajustes). */
export function layoutComFaixa(layout: Layout, ajustes?: AjustesDaFaixa): Layout {
  if (!layout.continuo || !ajustes) return layout;
  const vazio =
    !Object.keys(ajustes.faixaOverrides ?? {}).length && !ajustes.faixaExtras?.length && !ajustes.faixaOrdem;
  if (vazio) return layout;
  return { ...layout, faixa: { ...layout.faixa, camadas: faixaDoProjeto(layout, ajustes) } };
}

/** Campos do Modo Conteúdo de um tipo de slide: as camadas marcadas como editáveis, na ordem. */
export function camposEditaveis(tipo: TipoDeSlide): Camada[] {
  const r: Camada[] = [];
  const andar = (cs: Camada[]) =>
    cs.forEach((c) => (c.editavel && c.tipo !== 'grupo' ? r.push(c) : c.tipo === 'grupo' && andar(c.filhos)));
  andar(tipo.camadas);
  return r;
}
