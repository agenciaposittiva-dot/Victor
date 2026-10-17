import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { materializar, paraProjeto, type DocumentoEditavel } from '@/dominio/edicao';
import type { BrandKit, Layout, Projeto } from '@/dominio/schemas';
import { listaDo, localizar, type Dono, type Selecao } from './operacoes';

/** Estado do editor (um projeto aberto por vez). O documento são as camadas prontas de cada slide e da faixa;
 *  ao salvar, vira projeto de novo (só a diferença para o layout). Desfazer e refazer guardam cópias do documento
 *  com compartilhamento estrutural (immer): editar um slide não copia os outros, então o histórico não tem limite. */
export type Guias = { x: number[]; y: number[] };
export type Instantaneo = { doc: DocumentoEditavel; nome: string; guias: Guias };
export type Modo = 'conteudo' | 'design';
export type Ferramenta = 'mover' | 'mao' | 'texto' | 'retangulo' | 'elipse' | 'linha';
export type EstadoSalvamento = 'salvo' | 'pendente' | 'salvando' | 'erro' | 'conflito';
/** Um passo do histórico: o documento antes da mudança e a seleção daquele momento (volta junto ao desfazer,
 *  para mostrar o que mudou). Zoom, rolagem e painéis não entram no histórico. */
type Passo = { inst: Instantaneo; rotulo: string; selecao: Selecao; slideAtivo: number };

export type EstadoEditor = Instantaneo & {
  projeto: Projeto | null;
  layout: Layout | null;
  kit: BrandKit | null;
  passado: Passo[];
  futuro: Passo[];
  ultimaChave: string | null;
  ultimaVez: number;
  modo: Modo;
  ferramenta: Ferramenta;
  slideAtivo: number;
  selecao: Selecao;
  editandoTexto: { dono: Dono; id: string } | null;
  salvamento: EstadoSalvamento;
  /** versão da última gravação (marca única; para recusar salvar por cima de outra aba). */
  versaoSalva?: string;
  erroAoSalvar?: string;
  /** outra aba salvou este projeto (aviso fixo até a pessoa escolher). */
  alteradoEmOutraAba: boolean;
  /** outra aba excluiu este projeto: o salvamento automático para até a pessoa escolher. */
  excluidoEmOutraAba: boolean;
};

const VAZIO: Instantaneo = { doc: { slides: [], faixa: [] }, nome: '', guias: { x: [], y: [] } };
const SEM_SELECAO: Selecao = { dono: 0, ids: [] };
/** Edições seguidas com a mesma chave viram um passo só no desfazer (ex.: digitar uma frase num campo); uma pausa
 *  de 500 ms começa um passo novo. Arrastar, redimensionar e girar são gestos: um passo do clique até soltar. */
export const JUNTAR_MS = 500;

export const useEditor = create<EstadoEditor>()(() => ({
  ...VAZIO,
  projeto: null,
  layout: null,
  kit: null,
  passado: [],
  futuro: [],
  ultimaChave: null,
  ultimaVez: 0,
  modo: 'conteudo',
  ferramenta: 'mover',
  slideAtivo: 0,
  selecao: SEM_SELECAO,
  editandoTexto: null,
  salvamento: 'salvo',
  alteradoEmOutraAba: false,
  excluidoEmOutraAba: false,
}));

const instantaneo = (s: EstadoEditor): Instantaneo => ({ doc: s.doc, nome: s.nome, guias: s.guias });

/** Seleção sem ids que não existem mais (depois de desfazer, excluir slide…). */
function selecaoValida(doc: DocumentoEditavel, sel: Selecao): Selecao {
  if (sel.dono !== 'faixa' && !doc.slides[sel.dono]) return SEM_SELECAO;
  const lista = listaDo(doc, sel.dono);
  const ids = sel.ids.filter((id) => localizar(lista, id));
  return ids.length === sel.ids.length ? sel : { ...sel, ids };
}

let gesto: { inst: Instantaneo; selecao: Selecao; slideAtivo: number } | null = null;

/** Tudo o que "cancelar" precisa para voltar exatamente ao estado anterior (documento e histórico). */
export type Captura = Pick<
  EstadoEditor,
  'doc' | 'nome' | 'guias' | 'passado' | 'futuro' | 'ultimaChave' | 'ultimaVez' | 'salvamento'
>;

export const editor = {
  /** Abre um projeto. Sem kit (o do projeto não existe mais), abre mesmo assim e a interface avisa. */
  carregar(op: { projeto: Projeto; layout: Layout; kit: BrandKit | null; versao?: string; modo?: Modo }) {
    const temCampos = op.layout.tiposDeSlide.some((t) => JSON.stringify(t.camadas).includes('"editavel":true'));
    useEditor.setState({
      projeto: op.projeto,
      layout: op.layout,
      kit: op.kit,
      doc: materializar(op.layout, op.projeto),
      nome: op.projeto.nome,
      guias: op.projeto.guias ?? { x: [], y: [] },
      passado: [],
      futuro: [],
      ultimaChave: null,
      ultimaVez: 0,
      modo: op.modo ?? (temCampos ? 'conteudo' : 'design'),
      ferramenta: 'mover',
      slideAtivo: 0,
      selecao: SEM_SELECAO,
      editandoTexto: null,
      salvamento: 'salvo',
      versaoSalva: op.versao ?? op.projeto.versao ?? op.projeto.atualizadoEm,
      erroAoSalvar: undefined,
      alteradoEmOutraAba: false,
      excluidoEmOutraAba: false,
    });
    gesto = null;
  },

  fechar() {
    useEditor.setState({ ...VAZIO, projeto: null, layout: null, kit: null, passado: [], futuro: [] });
    gesto = null;
  },

  /** Uma edição com desfazer. "chave" junta edições seguidas do mesmo tipo (digitar, arrastar um controle). */
  editar(rotulo: string, receita: (d: Draft<Instantaneo>) => void, chave?: string) {
    const s = useEditor.getState();
    const atual = instantaneo(s);
    const novo = produce(atual, receita);
    if (novo === atual) return;
    const agora = Date.now();
    const juntar = !!chave && chave === s.ultimaChave && agora - s.ultimaVez < JUNTAR_MS;
    useEditor.setState({
      ...novo,
      passado: juntar
        ? s.passado
        : [...s.passado, { inst: atual, rotulo, selecao: s.selecao, slideAtivo: s.slideAtivo }],
      futuro: [],
      ultimaChave: chave ?? null,
      ultimaVez: agora,
      salvamento: s.salvamento === 'conflito' ? 'conflito' : 'pendente',
      selecao: selecaoValida(novo.doc, s.selecao),
    });
  },

  /** Arrastar: o começo guarda o estado, cada movimento altera sem histórico e o fim vira um passo só. */
  iniciarGesto() {
    const s = useEditor.getState();
    gesto = { inst: instantaneo(s), selecao: s.selecao, slideAtivo: s.slideAtivo };
  },
  gesto(receita: (d: Draft<Instantaneo>) => void) {
    const base = instantaneo(useEditor.getState());
    const novo = produce(base, receita);
    // produce devolve o mesmo objeto quando a receita não muda nada: aí não atualiza (nem redesenha)
    if (novo.doc !== base.doc || novo.nome !== base.nome || novo.guias !== base.guias) useEditor.setState({ ...novo });
  },
  terminarGesto(rotulo: string) {
    const s = useEditor.getState();
    const inicio = gesto;
    gesto = null;
    if (!inicio || inicio.inst.doc === s.doc) return;
    useEditor.setState({
      passado: [...s.passado, { ...inicio, rotulo }],
      futuro: [],
      ultimaChave: null,
      salvamento: s.salvamento === 'conflito' ? 'conflito' : 'pendente',
    });
  },
  cancelarGesto() {
    if (gesto) useEditor.setState({ ...gesto.inst });
    gesto = null;
  },

  desfazer() {
    const s = useEditor.getState();
    const passo = s.passado.at(-1);
    if (!passo) return;
    useEditor.setState({
      ...passo.inst,
      passado: s.passado.slice(0, -1),
      futuro: [
        ...s.futuro,
        { inst: instantaneo(s), rotulo: passo.rotulo, selecao: s.selecao, slideAtivo: s.slideAtivo },
      ],
      ultimaChave: null,
      selecao: selecaoValida(passo.inst.doc, passo.selecao),
      slideAtivo: Math.min(passo.slideAtivo, passo.inst.doc.slides.length - 1),
      editandoTexto: null,
      salvamento: s.salvamento === 'conflito' ? 'conflito' : 'pendente',
    });
  },
  refazer() {
    const s = useEditor.getState();
    const passo = s.futuro.at(-1);
    if (!passo) return;
    useEditor.setState({
      ...passo.inst,
      futuro: s.futuro.slice(0, -1),
      passado: [
        ...s.passado,
        { inst: instantaneo(s), rotulo: passo.rotulo, selecao: s.selecao, slideAtivo: s.slideAtivo },
      ],
      ultimaChave: null,
      selecao: selecaoValida(passo.inst.doc, passo.selecao),
      slideAtivo: Math.min(passo.slideAtivo, passo.inst.doc.slides.length - 1),
      editandoTexto: null,
      salvamento: s.salvamento === 'conflito' ? 'conflito' : 'pendente',
    });
  },

  /** Guarda o histórico inteiro (para "cancelar" deixar tudo exatamente como antes, ex.: Esc na edição de texto). */
  capturar(): Captura {
    const s = useEditor.getState();
    return {
      doc: s.doc,
      nome: s.nome,
      guias: s.guias,
      passado: s.passado,
      futuro: s.futuro,
      ultimaChave: s.ultimaChave,
      ultimaVez: s.ultimaVez,
      salvamento: s.salvamento,
    };
  },
  restaurar(c: Captura) {
    const s = useEditor.getState();
    // se nesse meio tempo o projeto foi salvo, a versão restaurada precisa ser salva de novo
    const salvamento = s.salvamento === 'conflito' ? 'conflito' : c.doc === s.doc ? s.salvamento : 'pendente';
    useEditor.setState({ ...c, salvamento: salvamento === 'salvando' ? 'pendente' : salvamento });
  },

  /** Escolhe o Brand Kit do projeto (ex.: o do projeto não existe mais neste navegador). */
  escolherKit(kit: BrandKit) {
    const s = useEditor.getState();
    if (!s.projeto) return;
    useEditor.setState({
      kit,
      projeto: { ...s.projeto, brandKitId: kit.id },
      salvamento: s.salvamento === 'conflito' ? 'conflito' : 'pendente',
    });
  },

  selecionar(selecao: Selecao) {
    const s = useEditor.getState();
    useEditor.setState({
      selecao,
      ...(selecao.dono !== 'faixa' && selecao.ids.length && { slideAtivo: selecao.dono }),
      ...(s.editandoTexto && !selecao.ids.includes(s.editandoTexto.id) && { editandoTexto: null }),
    });
  },
  ativarSlide(i: number) {
    const s = useEditor.getState();
    const slideAtivo = Math.max(0, Math.min(s.doc.slides.length - 1, i));
    useEditor.setState({
      slideAtivo,
      ...(s.selecao.dono !== slideAtivo && { selecao: { dono: slideAtivo, ids: [] } }),
    });
  },
  definirModo(modo: Modo) {
    useEditor.setState({ modo, selecao: SEM_SELECAO, editandoTexto: null, ferramenta: 'mover' });
  },
  definirFerramenta(ferramenta: Ferramenta) {
    useEditor.setState({ ferramenta });
  },
  editarTexto(alvo: { dono: Dono; id: string } | null) {
    useEditor.setState({ editandoTexto: alvo, ...(alvo && { selecao: { dono: alvo.dono, ids: [alvo.id] } }) });
  },
};

/** O projeto como seria salvo agora (calculado uma vez por documento + projeto base + layout + nome + guias).
 *  A referência do projeto base entra na chave: escolher outro kit muda o projeto salvo mesmo sem mexer no documento. */
const cacheProjeto = new WeakMap<DocumentoEditavel, WeakMap<Projeto, WeakMap<Layout, Map<string, Projeto>>>>();
export function projetoAtual(s: Pick<EstadoEditor, 'projeto' | 'layout' | 'doc' | 'nome' | 'guias'>): Projeto | null {
  if (!s.projeto || !s.layout) return null;
  let porProjeto = cacheProjeto.get(s.doc);
  if (!porProjeto) cacheProjeto.set(s.doc, (porProjeto = new WeakMap()));
  let porLayout = porProjeto.get(s.projeto);
  if (!porLayout) porProjeto.set(s.projeto, (porLayout = new WeakMap()));
  let porChave = porLayout.get(s.layout);
  if (!porChave) porLayout.set(s.layout, (porChave = new Map()));
  const chave = JSON.stringify([s.nome, s.guias]);
  const salvo = porChave.get(chave);
  if (salvo) return salvo;
  const temGuias = s.guias.x.length > 0 || s.guias.y.length > 0;
  const { guias: _g, ...semGuias } = s.projeto;
  const p = paraProjeto({ ...semGuias, nome: s.nome, ...(temGuias && { guias: s.guias }) }, s.layout, s.doc);
  porChave.set(chave, p);
  return p;
}
