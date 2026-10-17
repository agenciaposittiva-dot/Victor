import { garantirIdsUnicos, semUrlsTemporarias } from './ids';
import { faixaDoProjeto, montarSlide, tipoDoLayout } from './montagem';

export { copiarComIdsNovos, garantirIdsUnicos, idLivre, idsDaArvore, semUrlsTemporarias, urlTemporaria } from './ids';
import {
  Layout,
  type Camada,
  type Fundo,
  type Projeto,
  type SlideDoProjeto,
  type TipoDeSlide,
  type ValorCampo,
} from './schemas';

/** O editor trabalha com as camadas prontas de cada slide (layout + conteúdo + ajustes + extras), porque assim
 *  mover, agrupar, reordenar e apagar são operações simples numa árvore. Ao salvar, a diferença entre o que está
 *  no editor e o layout volta para o formato do projeto (conteúdo, ajustes, extras e ordem): o layout continua
 *  reutilizável e trocar o Brand Kit ou atualizar o layout ainda re-veste o projeto. */
export type SlideEditavel = { id: string; tipoId: string; fundo?: Fundo; camadas: Camada[] };
export type DocumentoEditavel = { slides: SlideEditavel[]; faixa: Camada[] };

type ProjetoParaEditar = Pick<Projeto, 'slides'> &
  Partial<Pick<Projeto, 'faixaOverrides' | 'faixaExtras' | 'faixaOrdem'>>;

/** Ao abrir, um id repetido no slide (ex.: extra salva com o mesmo id de uma camada do layout) ganha id novo: o
 *  editor nunca trabalha com dois ids iguais (seleção, ajustes e salvamento dependem do id). O desenho não muda. */
export function materializarSlide(layout: Layout, s: SlideDoProjeto): SlideEditavel {
  const camadas = garantirIdsUnicos(montarSlide(layout, s).camadas);
  return { id: s.id, tipoId: s.tipoId, ...(s.fundo && { fundo: s.fundo }), camadas };
}

export function materializar(layout: Layout, projeto: ProjetoParaEditar): DocumentoEditavel {
  return {
    slides: projeto.slides.map((s) => materializarSlide(layout, s)),
    faixa: garantirIdsUnicos(faixaDoProjeto(layout, projeto)),
  };
}

/** Igualdade estrutural (objetos, listas e valores simples), ignorando chaves com undefined. */
export function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => igual(v, bb[i]));
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => igual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const CONTEUDO_TEXTO = ['texto'];
const CONTEUDO_IMAGEM = ['url', 'assetId', 'foco', 'zoom'];

type Saida = {
  conteudo: Record<string, ValorCampo>;
  overrides: Record<string, Record<string, unknown>>;
};

/** Propriedades que mudaram de l (layout) para e (editor). undefined no editor vira null (apagar). */
function diferencaDePropriedades(l: Camada, e: Camada, ignorar: Set<string>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  const lr = l as Record<string, unknown>;
  const er = e as Record<string, unknown>;
  for (const k of new Set([...Object.keys(lr), ...Object.keys(er)])) {
    if (k === 'id' || k === 'tipo' || ignorar.has(k)) continue;
    if (!igual(lr[k], er[k])) r[k] = er[k] === undefined ? null : er[k];
  }
  return r;
}

const mesmosFilhos = (a: Camada[], b: Camada[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i]!.id && c.tipo === b[i]!.tipo);

/** Uma camada que existe no layout (no mesmo nível): conteúdo dos campos editáveis vai para "conteudo", o resto
 *  para "overrides". Num grupo com os mesmos filhos, desce camada por camada; se os filhos mudaram (entrou, saiu
 *  ou trocou de ordem), o ajuste leva a lista pronta. */
function diferencaDaCamada(l: Camada, e: Camada, out: Saida, comConteudo: boolean) {
  const ignorar = new Set<string>(['filhos']);
  if (comConteudo && l.editavel) {
    if (l.tipo === 'texto' && e.tipo === 'texto') {
      CONTEUDO_TEXTO.forEach((k) => ignorar.add(k));
      if (e.texto !== l.texto) out.conteudo[e.id] = e.texto;
    } else if ((l.tipo === 'imagem' || l.tipo === 'logo') && (e.tipo === 'imagem' || e.tipo === 'logo')) {
      const lr = l as Record<string, unknown>;
      const er = e as Record<string, unknown>;
      const valor: Record<string, unknown> = {};
      let mudou = false;
      for (const k of CONTEUDO_IMAGEM) {
        // o conteúdo só sabe definir valores: tirar um valor que o layout tinha continua sendo ajuste (null)...
        if (er[k] === undefined) continue;
        ignorar.add(k);
        valor[k] = er[k];
        if (!igual(lr[k], er[k])) mudou = true;
      }
      // ...menos a foto: o conteúdo com assetId já tira a url do layout (e com url, o assetId). A foto fica num
      // lugar só, sem um ajuste { url: null } ao lado.
      if (er.assetId !== undefined && er.url === undefined && lr.url !== undefined) {
        ignorar.add('url');
        mudou = true;
      }
      if (er.url !== undefined && er.assetId === undefined && lr.assetId !== undefined) {
        ignorar.add('assetId');
        mudou = true;
      }
      if (mudou) out.conteudo[e.id] = valor as ValorCampo;
    }
  }
  const o = diferencaDePropriedades(l, e, ignorar);
  if (l.tipo === 'grupo' && e.tipo === 'grupo') {
    if (mesmosFilhos(l.filhos, e.filhos))
      l.filhos.forEach((lf, i) => diferencaDaCamada(lf, e.filhos[i]!, out, comConteudo));
    else o.filhos = e.filhos;
  }
  if (Object.keys(o).length) out.overrides[e.id] = o;
}

/** Diferença de uma lista de camadas (topo de um slide ou da faixa) contra a do layout. */
function diferencaDaLista(doLayout: Camada[], editadas: Camada[], out: Saida, comConteudo: boolean) {
  const porId = new Map(doLayout.map((c) => [c.id, c]));
  const presentes = new Set<string>();
  const extras: Camada[] = [];
  for (const e of editadas) {
    const l = porId.get(e.id);
    const mesmoTipo =
      l &&
      (l.tipo === e.tipo || ((l.tipo === 'imagem' || l.tipo === 'logo') && (e.tipo === 'imagem' || e.tipo === 'logo')));
    if (l && mesmoTipo && !presentes.has(e.id)) {
      presentes.add(e.id);
      diferencaDaCamada(l, e, out, comConteudo);
    } else extras.push(e);
  }
  for (const l of doLayout) if (!presentes.has(l.id)) out.overrides[l.id] = { removida: true };
  const natural = [...doLayout.filter((l) => presentes.has(l.id)).map((l) => l.id), ...extras.map((c) => c.id)];
  const editadasIds = editadas.map((c) => c.id);
  return { extras, ordem: igual(natural, editadasIds) ? undefined : editadasIds };
}

/** Slide do editor → slide do projeto (só o que difere do tipo de slide do layout). */
export function diferencaDoSlide(tipo: TipoDeSlide, s: SlideEditavel): SlideDoProjeto {
  const out: Saida = { conteudo: {}, overrides: {} };
  const { extras, ordem } = diferencaDaLista(tipo.camadas, semUrlsTemporarias(garantirIdsUnicos(s.camadas)), out, true);
  return {
    id: s.id,
    tipoId: s.tipoId,
    conteudo: out.conteudo,
    overrides: out.overrides,
    camadasExtras: extras,
    ...(ordem && { ordem }),
    ...(s.fundo && !igual(s.fundo, tipo.fundo) && { fundo: s.fundo }),
  };
}

/** Faixa do editor → ajustes, extras e ordem da faixa no projeto. */
export function diferencaDaFaixa(
  layout: Layout,
  faixa: Camada[],
): Pick<Projeto, 'faixaOverrides' | 'faixaExtras'> & Partial<Pick<Projeto, 'faixaOrdem'>> {
  if (!layout.continuo) return { faixaOverrides: {}, faixaExtras: [] };
  const out: Saida = { conteudo: {}, overrides: {} };
  const { extras, ordem } = diferencaDaLista(
    layout.faixa?.camadas ?? [],
    semUrlsTemporarias(garantirIdsUnicos(faixa)),
    out,
    false,
  );
  return { faixaOverrides: out.overrides, faixaExtras: extras, ...(ordem && { faixaOrdem: ordem }) };
}

/** Documento do editor → projeto pronto para salvar. */
export function paraProjeto(base: Projeto, layout: Layout, doc: DocumentoEditavel): Projeto {
  const { faixaOrdem: _o, ...semOrdem } = base;
  return {
    ...semOrdem,
    slides: doc.slides.map((s) => diferencaDoSlide(tipoDoLayout(layout, s.tipoId), s)),
    ...diferencaDaFaixa(layout, doc.faixa),
  };
}

/** Assinatura de design de um slide: tudo menos o conteúdo (textos e imagens). Slides do mesmo tipo com a mesma
 *  assinatura viram um tipo só no "Salvar como layout"; designs diferentes viram tipos separados. */
function assinaturaDeDesign(s: SlideDoProjeto): string {
  const tirarConteudo = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !CONTEUDO_TEXTO.includes(k) && !CONTEUDO_IMAGEM.includes(k)));
  const limparCamada = (c: Camada): unknown => {
    const r = tirarConteudo(c as Record<string, unknown>);
    if (c.tipo === 'grupo') r.filhos = c.filhos.map(limparCamada);
    return r;
  };
  const overrides = Object.fromEntries(
    Object.entries(s.overrides)
      .map(([id, o]) => [id, tirarConteudo(o)] as const)
      .filter(([, o]) => Object.keys(o).length),
  );
  return JSON.stringify({ t: s.tipoId, f: s.fundo, o: s.ordem, a: overrides, e: s.camadasExtras.map(limparCamada) });
}

/** "Salvar como layout": o projeto vira um layout novo. As camadas extras e os ajustes de cada slide viram camadas
 *  do tipo de slide (com o conteúdo atual como texto de exemplo); slides do mesmo tipo com design diferente viram
 *  tipos separados ("Conteúdo 2"); a faixa leva os ajustes e as extras. Devolve também o tipo de cada slide. */
export function salvarComoLayout(
  layout: Layout,
  projeto: Projeto,
  dados: { id: string; nome: string; categoria?: string; tags?: string[] },
): { layout: Layout; tipoDoSlide: string[]; projeto: Projeto } {
  const tipos: TipoDeSlide[] = [];
  const porAssinatura = new Map<string, string>();
  const usados = new Set(layout.tiposDeSlide.map((t) => t.id));
  const tipoDoSlide: string[] = [];
  const contagem = new Map<string, number>();
  projeto.slides.forEach((s, i) => {
    const chave = assinaturaDeDesign(s);
    const ja = porAssinatura.get(chave);
    if (ja) return void tipoDoSlide.push(ja);
    const original = tipoDoLayout(layout, s.tipoId);
    const n = (contagem.get(original.id) ?? 0) + 1;
    contagem.set(original.id, n);
    let id = n === 1 ? original.id : `${original.id}-${n}`;
    while (n > 1 && usados.has(id)) id += '-b';
    usados.add(id);
    const m = montarSlide(layout, s, i);
    tipos.push({
      ...original,
      id,
      nome: n === 1 ? original.nome : `${original.nome} ${n}`,
      fundo: m.fundo,
      camadas: m.camadas,
    });
    porAssinatura.set(chave, id);
    tipoDoSlide.push(id);
  });
  // tipos que nenhum slide usa continuam como estavam
  for (const t of layout.tiposDeSlide) if (!tipos.some((x) => x.id === t.id)) tipos.push(t);
  const novo = Layout.parse({
    ...layout,
    id: dados.id,
    nome: dados.nome,
    categoria: dados.categoria ?? layout.categoria,
    tags: dados.tags ?? layout.tags,
    status: 'rascunho',
    origem: 'editor',
    tiposDeSlide: tipos,
    ...(layout.continuo && { faixa: { ...layout.faixa, camadas: faixaDoProjeto(layout, projeto) } }),
    atualizadoEm: new Date().toISOString(),
  });
  // o mesmo projeto apontando para o layout novo: só sobra o que difere do tipo novo (em geral, os textos)
  const doc = materializar(layout, projeto);
  const noNovo = paraProjeto({ ...projeto, layoutId: novo.id, faixaOverrides: {}, faixaExtras: [] }, novo, {
    slides: doc.slides.map((s, i) => ({ ...s, tipoId: tipoDoSlide[i]! })),
    faixa: doc.faixa,
  });
  return { layout: novo, tipoDoSlide, projeto: noNovo };
}
