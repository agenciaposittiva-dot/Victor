import { materializarSlide, type DocumentoEditavel, type SlideEditavel } from '@/dominio/edicao';
import { pontoNaFaixaParaSlide, pontosDaSemente, posicaoNaFaixa } from '@/dominio/faixa';
import { clonar, copiarComIdsNovos, idsDaArvore } from '@/dominio/ids';
import type { Camada, CamadaForma, CamadaGrupo, Layout } from '@/dominio/schemas';
import { novoId } from '@/dados/repositorio';
import { arred, caixaDeContorno, uniao, type Caixa, type Retangulo } from './geometria';

/** Operações do editor sobre o documento (camadas prontas de cada slide e da faixa). Todas recebem o documento
 *  para alterar no lugar (o estado do editor passa um rascunho do immer) e são testadas sem interface. */

/** Dono de uma camada: o índice do slide ou a faixa contínua. */
export type Dono = number | 'faixa';
export type Selecao = { dono: Dono; ids: string[] };
export type Contexto = { w: number; h: number; continuo: boolean };

export const listaDo = (doc: DocumentoEditavel, dono: Dono): Camada[] =>
  dono === 'faixa' ? doc.faixa : (doc.slides[dono]?.camadas ?? []);

export type Local = { lista: Camada[]; indice: number; camada: Camada; pais: CamadaGrupo[] };

export function localizar(lista: Camada[], id: string, pais: CamadaGrupo[] = []): Local | null {
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i]!;
    if (c.id === id) return { lista, indice: i, camada: c, pais };
    if (c.tipo === 'grupo') {
      const r = localizar(c.filhos, id, [...pais, c]);
      if (r) return r;
    }
  }
  return null;
}

export const acharCamada = (doc: DocumentoEditavel, dono: Dono, id: string) =>
  localizar(listaDo(doc, dono), id)?.camada;

/** Quanto o dono está deslocado na tela: no contínuo, o slide i começa em i × w; senão todo slide começa em 0. */
export const deslocamentoDo = (dono: Dono, ctx: Contexto) => (dono === 'faixa' || !ctx.continuo ? 0 : dono * ctx.w);

/** Caixa de uma camada em coordenadas do documento (somando grupos, deslocamento do slide e, na faixa, âncora e
 *  "estica" resolvidos). */
export function caixaNoDocumento(doc: DocumentoEditavel, dono: Dono, id: string, ctx: Contexto): Caixa | null {
  const loc = localizar(listaDo(doc, dono), id);
  if (!loc) return null;
  const n = doc.slides.length;
  const resolver = (c: Camada) => (dono === 'faixa' ? posicaoNaFaixa(c, n, ctx.w) : c);
  let x = deslocamentoDo(dono, ctx);
  let y = 0;
  loc.pais.forEach((p, k) => {
    const r = k === 0 ? resolver(p) : p;
    x += r.x;
    y += r.y;
  });
  const c = loc.pais.length ? loc.camada : resolver(loc.camada);
  return { x: x + c.x, y: y + c.y, w: c.w, h: c.h, ...(c.rotacao ? { rotacao: c.rotacao } : {}) };
}

/** Caixa do slide (ou da faixa inteira) em coordenadas do documento. */
export function caixaDoDono(doc: DocumentoEditavel, dono: Dono, ctx: Contexto): Retangulo {
  if (dono === 'faixa') return { x: 0, y: 0, w: doc.slides.length * ctx.w, h: ctx.h };
  return { x: deslocamentoDo(dono, ctx), y: 0, w: ctx.w, h: ctx.h };
}

/** Altera propriedades das camadas (objeto parcial ou função que muda a camada). */
export function alterar(
  doc: DocumentoEditavel,
  dono: Dono,
  ids: string[],
  mudanca: Partial<Camada> | ((c: Camada) => void),
) {
  for (const id of ids) {
    const loc = localizar(listaDo(doc, dono), id);
    if (!loc) continue;
    if (typeof mudanca === 'function') mudanca(loc.camada);
    else Object.assign(loc.camada, mudanca);
  }
}

export function mover(doc: DocumentoEditavel, dono: Dono, ids: string[], dx: number, dy: number) {
  alterar(doc, dono, ids, (c) => {
    if (c.travada) return;
    c.x = arred(c.x + dx);
    c.y = arred(c.y + dy);
  });
}

export type Alinhamento = 'esquerda' | 'centroH' | 'direita' | 'topo' | 'meioV' | 'base';

/** Slide de referência de uma camada: o do próprio dono ou, na faixa, o slide onde fica o centro dela. */
function slideDe(doc: DocumentoEditavel, dono: Dono, c: Caixa, ctx: Contexto): number {
  if (dono !== 'faixa') return dono;
  const meio = caixaDeContorno(c);
  return Math.max(0, Math.min(doc.slides.length - 1, Math.floor((meio.x + meio.w / 2) / ctx.w)));
}

/** Alinha as camadas pela caixa de contorno de cada uma: em relação à seleção (2 ou mais) ou ao slide (1). */
export function alinhar(doc: DocumentoEditavel, dono: Dono, ids: string[], modo: Alinhamento, ctx: Contexto) {
  const caixas = ids.map((id) => [id, caixaNoDocumento(doc, dono, id, ctx)] as const).filter((x) => x[1]);
  if (!caixas.length) return;
  const ref =
    caixas.length > 1
      ? uniao(caixas.map((x) => x[1]!))
      : caixaDoDono(doc, slideDe(doc, dono, caixas[0]![1]!, ctx), ctx);
  for (const [id, cx] of caixas) {
    const r = caixaDeContorno(cx!);
    let dx = 0;
    let dy = 0;
    if (modo === 'esquerda') dx = ref.x - r.x;
    if (modo === 'centroH') dx = ref.x + ref.w / 2 - (r.x + r.w / 2);
    if (modo === 'direita') dx = ref.x + ref.w - (r.x + r.w);
    if (modo === 'topo') dy = ref.y - r.y;
    if (modo === 'meioV') dy = ref.y + ref.h / 2 - (r.y + r.h / 2);
    if (modo === 'base') dy = ref.y + ref.h - (r.y + r.h);
    mover(doc, dono, [id], dx, dy);
  }
}

/** Distribui 3 ou mais camadas com espaços iguais entre elas (na horizontal ou na vertical). */
export function distribuir(doc: DocumentoEditavel, dono: Dono, ids: string[], eixo: 'h' | 'v', ctx: Contexto) {
  const itens = ids
    .map((id) => ({ id, r: caixaDeContorno(caixaNoDocumento(doc, dono, id, ctx) ?? { x: 0, y: 0, w: 0, h: 0 }) }))
    .sort((a, b) => (eixo === 'h' ? a.r.x - b.r.x : a.r.y - b.r.y));
  if (itens.length < 3) return;
  const ini = eixo === 'h' ? itens[0]!.r.x : itens[0]!.r.y;
  const ult = itens.at(-1)!.r;
  const fim = eixo === 'h' ? ult.x + ult.w : ult.y + ult.h;
  const soma = itens.reduce((s, i) => s + (eixo === 'h' ? i.r.w : i.r.h), 0);
  const espaco = (fim - ini - soma) / (itens.length - 1);
  let pos = ini;
  for (const i of itens) {
    const atual = eixo === 'h' ? i.r.x : i.r.y;
    mover(doc, dono, [i.id], eixo === 'h' ? pos - atual : 0, eixo === 'v' ? pos - atual : 0);
    pos += (eixo === 'h' ? i.r.w : i.r.h) + espaco;
  }
}

/** Ids da seleção que estão na mesma lista (mesmo pai), na ordem da lista. */
function mesmaLista(doc: DocumentoEditavel, dono: Dono, ids: string[]) {
  const locs = ids.map((id) => localizar(listaDo(doc, dono), id)).filter((l): l is Local => !!l);
  if (!locs.length) return null;
  const lista = locs[0]!.lista;
  if (locs.some((l) => l.lista !== lista)) return null;
  return { lista, locs: locs.sort((a, b) => a.indice - b.indice) };
}

/** Por que estas camadas não podem ser agrupadas (ou null se podem). Camadas com âncora ou "estica" (como a linha de
 *  luz, que ocupa todos os slides) deixariam de acompanhar a quantidade de slides dentro de um grupo. */
export function motivoParaNaoAgrupar(doc: DocumentoEditavel, dono: Dono, ids: string[]): string | null {
  const m = mesmaLista(doc, dono, ids);
  if (!m || m.locs.length < 2) return 'Selecione duas ou mais camadas do mesmo nível para agrupar.';
  const presas = m.locs.filter((l) => l.camada.estica || l.camada.ancora);
  if (presas.length)
    return `"${presas[0]!.camada.nome ?? presas[0]!.camada.id}" acompanha a quantidade de slides (âncora ou largura da faixa) e não pode entrar num grupo.`;
  return null;
}

/** Agrupa camadas da mesma lista. O grupo fica no lugar da camada de cima e os filhos passam a ser relativos a ele.
 *  Devolve o id do grupo (ou null se não deu para agrupar: veja motivoParaNaoAgrupar). */
export function agrupar(doc: DocumentoEditavel, dono: Dono, ids: string[]): string | null {
  if (motivoParaNaoAgrupar(doc, dono, ids)) return null;
  const m = mesmaLista(doc, dono, ids)!;
  const caixa = uniao(m.locs.map((l) => l.camada));
  const id = novoId('grupo');
  const filhos = m.locs.map(
    (l) => ({ ...l.camada, x: arred(l.camada.x - caixa.x), y: arred(l.camada.y - caixa.y) }) as Camada,
  );
  const topo = m.locs.at(-1)!.indice;
  const grupo: CamadaGrupo = {
    id,
    tipo: 'grupo',
    nome: 'Grupo',
    x: arred(caixa.x),
    y: arred(caixa.y),
    w: arred(caixa.w),
    h: arred(caixa.h),
    filhos,
  };
  const remover = new Set(m.locs.map((l) => l.camada.id));
  const antes = m.locs.filter((l) => l.indice < topo).length;
  for (let i = m.lista.length - 1; i >= 0; i--) if (remover.has(m.lista[i]!.id)) m.lista.splice(i, 1);
  m.lista.splice(topo - antes, 0, grupo);
  return id;
}

/** Desfaz grupos: os filhos voltam para a lista do grupo, com posição absoluta (girando junto, se o grupo estava
 *  girado) e a opacidade do grupo multiplicada. Devolve os ids dos filhos. */
export function desagrupar(doc: DocumentoEditavel, dono: Dono, ids: string[]): string[] {
  const soltos: string[] = [];
  for (const id of ids) {
    const loc = localizar(listaDo(doc, dono), id);
    if (!loc || loc.camada.tipo !== 'grupo') continue;
    const g = loc.camada;
    const rad = ((g.rotacao ?? 0) * Math.PI) / 180;
    const gc = { x: g.w / 2, y: g.h / 2 };
    const filhos = g.filhos.map((f) => {
      const n = { ...f } as Camada;
      if (g.rotacao) {
        const fc = { x: f.x + f.w / 2 - gc.x, y: f.y + f.h / 2 - gc.y };
        const r = { x: fc.x * Math.cos(rad) - fc.y * Math.sin(rad), y: fc.x * Math.sin(rad) + fc.y * Math.cos(rad) };
        n.x = arred(g.x + gc.x + r.x - f.w / 2);
        n.y = arred(g.y + gc.y + r.y - f.h / 2);
        n.rotacao = arred((f.rotacao ?? 0) + g.rotacao);
      } else {
        n.x = arred(f.x + g.x);
        n.y = arred(f.y + g.y);
      }
      if (g.opacidade !== undefined && g.opacidade < 1)
        n.opacidade = arred((f.opacidade ?? 1) * g.opacidade * 100) / 100;
      return n;
    });
    loc.lista.splice(loc.indice, 1, ...filhos);
    soltos.push(...filhos.map((f) => f.id));
  }
  return soltos;
}

export type Movimento = 'frente' | 'tras' | 'subir' | 'descer';

/** Muda a camada de altura (na lista dela): frente = em cima de todas. */
export function reordenar(doc: DocumentoEditavel, dono: Dono, ids: string[], mov: Movimento) {
  const m = mesmaLista(doc, dono, ids);
  if (!m) return;
  const escolhidas = m.locs.map((l) => l.camada);
  const lista = m.lista;
  if (mov === 'frente' || mov === 'tras') {
    const resto = lista.filter((c) => !escolhidas.includes(c));
    lista.splice(0, lista.length, ...(mov === 'frente' ? [...resto, ...escolhidas] : [...escolhidas, ...resto]));
    return;
  }
  const passo = mov === 'subir' ? 1 : -1;
  const ordem = mov === 'subir' ? [...m.locs].reverse() : m.locs;
  for (const l of ordem) {
    const i = lista.indexOf(l.camada);
    const j = i + passo;
    if (j < 0 || j >= lista.length || escolhidas.includes(lista[j]!)) continue;
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  }
}

/** Leva uma camada para outra posição da lista (arrastar no painel de camadas). */
export function moverNaLista(doc: DocumentoEditavel, dono: Dono, id: string, novoIndice: number) {
  const loc = localizar(listaDo(doc, dono), id);
  if (!loc) return;
  const [c] = loc.lista.splice(loc.indice, 1);
  loc.lista.splice(Math.max(0, Math.min(loc.lista.length, novoIndice)), 0, c!);
}

/** Duplica (ids novos, inclusive dos filhos), logo acima da original e um pouco deslocada. Devolve os ids novos. */
export function duplicar(doc: DocumentoEditavel, dono: Dono, ids: string[], deslocamento = 24): string[] {
  const usados = idsDaArvore(listaDo(doc, dono));
  const novos: string[] = [];
  for (const id of ids) {
    const loc = localizar(listaDo(doc, dono), id);
    if (!loc) continue;
    const [copia] = copiarComIdsNovos([loc.camada], usados);
    copia!.x = arred(copia!.x + deslocamento);
    copia!.y = arred(copia!.y + deslocamento);
    loc.lista.splice(loc.indice + 1, 0, copia!);
    novos.push(copia!.id);
  }
  return novos;
}

export function excluir(doc: DocumentoEditavel, dono: Dono, ids: string[]) {
  for (const id of ids) {
    const loc = localizar(listaDo(doc, dono), id);
    if (loc) loc.lista.splice(loc.indice, 1);
  }
}

/** Cola camadas (de outro slide, da faixa ou do mesmo lugar) com ids novos, por cima de tudo. Se já existe uma
 *  camada idêntica no mesmo lugar, desloca a cópia para não ficar escondida. Devolve os ids novos. */
export function colar(doc: DocumentoEditavel, dono: Dono, camadas: Camada[], deslocar = true): string[] {
  const lista = listaDo(doc, dono);
  const copias = copiarComIdsNovos(camadas, idsDaArvore(lista));
  const mesmaPosicao = (c: Camada) => lista.some((o) => o.x === c.x && o.y === c.y && o.w === c.w && o.h === c.h);
  if (deslocar && copias.some(mesmaPosicao))
    copias.forEach((c) => {
      c.x = arred(c.x + 24);
      c.y = arred(c.y + 24);
    });
  lista.push(...copias);
  return copias.map((c) => c.id);
}

/** Camada sem id (o id é gerado ao adicionar). */
export type CamadaNova = Camada extends infer C ? (C extends Camada ? Omit<C, 'id'> & { id?: string } : never) : never;

/** Camada nova (sempre com id único, nunca nomes simples como "texto"). Devolve o id. */
export function adicionar(doc: DocumentoEditavel, dono: Dono, camada: CamadaNova): string {
  const id = novoId(camada.tipo);
  listaDo(doc, dono).push({ ...camada, id } as Camada);
  return id;
}

// ——— slides ———

export function novoSlide(layout: Layout, tipoId: string): SlideEditavel {
  return materializarSlide(layout, { id: novoId('s'), tipoId, conteudo: {}, overrides: {}, camadasExtras: [] });
}

export function adicionarSlide(doc: DocumentoEditavel, layout: Layout, tipoId: string, posicao = doc.slides.length) {
  doc.slides.splice(posicao, 0, novoSlide(layout, tipoId));
  return posicao;
}

export function duplicarSlide(doc: DocumentoEditavel, i: number) {
  const s = doc.slides[i];
  if (!s) return i;
  doc.slides.splice(i + 1, 0, { ...clonar(s), id: novoId('s') });
  return i + 1;
}

export function excluirSlide(doc: DocumentoEditavel, i: number) {
  if (doc.slides.length <= 1) return false;
  doc.slides.splice(i, 1);
  return true;
}

export function moverSlide(doc: DocumentoEditavel, de: number, para: number) {
  if (de === para || !doc.slides[de]) return;
  const [s] = doc.slides.splice(de, 1);
  doc.slides.splice(Math.max(0, Math.min(doc.slides.length, para)), 0, s!);
}

/** Troca o tipo do slide: monta o tipo novo e leva o conteúdo dos campos editáveis que existem nos dois. */
export function trocarTipo(doc: DocumentoEditavel, layout: Layout, i: number, tipoId: string) {
  const antigo = doc.slides[i];
  if (!antigo || antigo.tipoId === tipoId) return;
  const novo = novoSlide(layout, tipoId);
  const campos = new Map<string, Camada>();
  const andar = (cs: Camada[]) => cs.forEach((c) => (c.tipo === 'grupo' ? andar(c.filhos) : campos.set(c.id, c)));
  andar(antigo.camadas);
  const levar = (cs: Camada[]) =>
    cs.forEach((c) => {
      if (c.tipo === 'grupo') return levar(c.filhos);
      const v = campos.get(c.id);
      if (!c.editavel || !v || v.tipo !== c.tipo) return;
      if (c.tipo === 'texto' && v.tipo === 'texto') c.texto = v.texto;
      if ((c.tipo === 'imagem' || c.tipo === 'logo') && (v.tipo === 'imagem' || v.tipo === 'logo'))
        Object.assign(c, { url: v.url, assetId: v.assetId, foco: v.foco, zoom: v.zoom });
    });
  levar(novo.camadas);
  doc.slides[i] = { ...novo, id: antigo.id };
}

// ——— carrossel contínuo ———

/** Leva camadas de um slide para a faixa (passam a atravessar os slides), mantendo o lugar na tela. */
export function moverParaFaixa(doc: DocumentoEditavel, i: number, ids: string[], ctx: Contexto): string[] {
  const movidas: string[] = [];
  const usados = idsDaArvore(doc.faixa);
  for (const id of ids) {
    const lista = doc.slides[i]?.camadas;
    const idx = lista?.findIndex((c) => c.id === id) ?? -1;
    if (!lista || idx < 0) continue;
    const [c] = lista.splice(idx, 1);
    const nova = { ...c!, x: arred(c!.x + i * ctx.w) } as Camada;
    delete nova.ancora;
    delete nova.estica;
    if (usados.has(nova.id)) nova.id = novoId(nova.tipo);
    usados.add(nova.id);
    doc.faixa.push(nova);
    movidas.push(nova.id);
  }
  return movidas;
}

/** Prende camadas da faixa a um slide (mantendo o lugar na tela). */
export function prenderAoSlide(doc: DocumentoEditavel, ids: string[], i: number, ctx: Contexto): string[] {
  const n = doc.slides.length;
  const presas: string[] = [];
  const s = doc.slides[i];
  if (!s) return presas;
  const usados = idsDaArvore(s.camadas);
  for (const id of ids) {
    const idx = doc.faixa.findIndex((c) => c.id === id);
    if (idx < 0) continue;
    const [c] = doc.faixa.splice(idx, 1);
    const resolvida = posicaoNaFaixa(c!, n, ctx.w);
    const nova = { ...c!, x: arred(resolvida.x - i * ctx.w), w: resolvida.w } as Camada;
    delete nova.ancora;
    delete nova.estica;
    if (usados.has(nova.id)) nova.id = novoId(nova.tipo);
    usados.add(nova.id);
    s.camadas.push(nova);
    presas.push(nova.id);
  }
  return presas;
}

// ——— linha de luz ———

const linhaDe = (doc: DocumentoEditavel, id: string) => {
  const c = acharCamada(doc, 'faixa', id);
  return c?.tipo === 'forma' && c.forma === 'linhaDeLuz' ? (c as CamadaForma) : null;
};

/** Na primeira edição, a linha sorteada vira pontos arrastáveis (mesmo desenho). */
export function garantirPontos(doc: DocumentoEditavel, id: string, ctx: Contexto) {
  const c = linhaDe(doc, id);
  if (!c || c.pontos?.length) return;
  const p = c.parametros ?? {};
  c.pontos = pontosDaSemente(doc.slides.length, ctx.w, c.h, {
    inicioX: p.inicioX,
    fimX: p.fimX,
    yMin: p.yMin,
    yMax: p.yMax,
    semente: p.semente,
    pontosPorSlide: p.pontosPorSlide,
  }).map((q) => ({ ...q, x: arred(q.x), y: arred(q.y) }));
}

/** Põe o ponto k na posição (x na faixa, y na camada): o slide do ponto é o slide em que ele cai. */
export function moverPonto(doc: DocumentoEditavel, id: string, k: number, x: number, y: number, ctx: Contexto) {
  const c = linhaDe(doc, id);
  if (!c?.pontos?.[k]) return;
  c.pontos[k] = pontoNaFaixaParaSlide(x, y, doc.slides.length, ctx.w);
}

export function adicionarPonto(doc: DocumentoEditavel, id: string, x: number, y: number, ctx: Contexto): number {
  garantirPontos(doc, id, ctx);
  const c = linhaDe(doc, id);
  if (!c?.pontos) return -1;
  c.pontos.push(pontoNaFaixaParaSlide(x, y, doc.slides.length, ctx.w));
  return c.pontos.length - 1;
}

export function removerPonto(doc: DocumentoEditavel, id: string, k: number) {
  const c = linhaDe(doc, id);
  if (!c?.pontos || c.pontos.length <= 2) return false;
  c.pontos.splice(k, 1);
  return true;
}

/** Volta para a linha sorteada pela semente (tira os pontos). */
export function restaurarLinhaSorteada(doc: DocumentoEditavel, id: string) {
  const c = linhaDe(doc, id);
  if (c) delete c.pontos;
}
