import type { BrandKit, Layout, Projeto } from '@/dominio/schemas';
import { lerKitSalvo, lerLayoutSalvo, lerProjetoSalvo, type Lido } from './migracao';

/** Onde ficam projetos, layouts, kits e arquivos (fotos e logos enviados). No modo local é o IndexedDB do
 *  navegador; na Fase 6 entra a implementação com Supabase, com a mesma interface.
 *  Registros que não validam nem depois da migração continuam aparecendo (ok: false), nunca somem. */
export interface Repositorio {
  listarProjetos(): Promise<Lido<Projeto>[]>;
  lerProjeto(id: string): Promise<Lido<Projeto> | undefined>;
  /** grava e devolve a versão nova (marca única da gravação). Com "esperado" (a versão aberta), recusa
   *  (ConflitoDeVersao) se outra aba salvou antes. */
  salvarProjeto(p: Projeto, opcoes?: { esperado?: string }): Promise<string>;
  excluirProjeto(id: string): Promise<void>;
  listarLayouts(): Promise<Lido<Layout>[]>;
  lerLayout(id: string): Promise<Lido<Layout> | undefined>;
  salvarLayout(l: Layout, opcoes?: { esperado?: string }): Promise<string>;
  excluirLayout(id: string): Promise<void>;
  listarKits(): Promise<Lido<BrandKit>[]>;
  salvarKit(k: BrandKit, opcoes?: { esperado?: string }): Promise<string>;
  salvarArquivo(blob: Blob, nome?: string): Promise<string>;
  lerArquivo(id: string): Promise<Blob | undefined>;
  /** apaga vários arquivos numa gravação só (confirmada no fim da transação). */
  excluirArquivos(ids: string[]): Promise<void>;
  /** acesso bruto, para o backup (Exportar tudo / Importar). */
  brutos(loja: Loja): Promise<Registro[]>;
  gravarBruto(loja: Loja, r: Registro): Promise<void>;
}

export type Loja = 'projetos' | 'layouts' | 'kits' | 'arquivos';
export const LOJAS: Loja[] = ['projetos', 'layouts', 'kits', 'arquivos'];
export type Registro = { id: string; versao?: string; atualizadoEm?: string; [k: string]: unknown };
export type Arquivo = { id: string; nome?: string; tipo: string; blob: Blob; criadoEm: string };

/** Outra aba salvou o mesmo registro depois que este foi aberto. */
export class ConflitoDeVersao extends Error {
  constructor(
    readonly id: string,
    readonly salvoEm: string | undefined,
  ) {
    super('Este projeto foi salvo em outra aba depois que você abriu.');
    this.name = 'ConflitoDeVersao';
  }
}

export const novoId = (prefixo: string) =>
  `${prefixo}-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))
    .replace(/-/g, '')
    .slice(0, 12)}`;

/** Identifica esta aba nos avisos entre abas. */
export const ID_DA_ABA = novoId('aba');

/** Avisos entre abas e do banco: "salvo" (outra aba salvou um registro), "banco-atualizado" (o banco mudou de
 *  versão em outra aba: recarregar) e "banco-bloqueado" (outra aba impede a atualização do banco). */
export type AvisoDoBanco =
  | { tipo: 'salvo'; loja: Loja; id: string; atualizadoEm: string; versao: string; aba: string }
  | { tipo: 'excluido'; loja: Loja; id: string; aba: string }
  | { tipo: 'banco-atualizado' }
  | { tipo: 'banco-bloqueado' };
const ouvintes = new Set<(a: AvisoDoBanco) => void>();
let canal: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    canal = new BroadcastChannel('aragonez-builder');
    canal.onmessage = (e: MessageEvent<AvisoDoBanco>) => ouvintes.forEach((f) => f(e.data));
  }
} catch {
  canal = null;
}
export function ouvirBanco(f: (a: AvisoDoBanco) => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
/** Avisa só esta aba (problemas do banco). */
const avisarAqui = (a: AvisoDoBanco) => ouvintes.forEach((f) => f(a));
/** Avisa as outras abas (salvamentos). */
const avisarOutrasAbas = (a: AvisoDoBanco) => {
  try {
    canal?.postMessage(a);
  } catch {
    /* aba sem BroadcastChannel: só a comparação do atualizadoEm protege */
  }
};

/** No primeiro salvamento, pede ao navegador para não apagar os dados quando faltar espaço (modo local). */
let pediuPersistencia = false;
/** Só para os testes: volta a marca de "já pediu". */
export const zerarPedidoDePersistencia = () => {
  pediuPersistencia = false;
};
export async function pedirPersistencia(): Promise<boolean | undefined> {
  if (pediuPersistencia || typeof navigator === 'undefined' || !navigator.storage?.persist) return undefined;
  pediuPersistencia = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return undefined;
  }
}

let contadorDeGravacoes = 0;

/** Data nova e sempre crescente (dois salvamentos no mesmo milissegundo não ficam com a mesma data). */
let ultimaData = '';
function agora(): string {
  let d = new Date().toISOString();
  if (d <= ultimaData) d = new Date(Date.parse(ultimaData) + 1).toISOString();
  return (ultimaData = d);
}

/** Versão gravada de um registro (os gravados antes do campo "versao" usam o atualizadoEm). */
export const versaoDe = (r: Record<string, unknown> | { versao?: string; atualizadoEm?: string } | undefined) =>
  (typeof r?.versao === 'string' ? r.versao : typeof r?.atualizadoEm === 'string' ? r.atualizadoEm : undefined) as
    string | undefined;

/** Mais recente primeiro; na mesma data, desempata pela versão (contador crescente da aba). */
const porData = <T>(a: Lido<T>, b: Lido<T>) => {
  const chave = (x: Lido<T>) => {
    const v = x.ok ? (x.valor as { atualizadoEm?: string; versao?: string }) : {};
    return `${v.atualizadoEm ?? ''}|${v.versao ?? ''}`;
  };
  return chave(b).localeCompare(chave(a));
};

abstract class Base implements Repositorio {
  abstract brutos(loja: Loja): Promise<Registro[]>;
  protected abstract ler(loja: Loja, id: string): Promise<Registro | undefined>;
  abstract gravarBruto(loja: Loja, r: Registro): Promise<void>;
  /** grava só se a versão salva for a esperada (na mesma transação); devolve false se não for. */
  protected abstract gravarSe(loja: Loja, r: Registro, esperado: string | undefined): Promise<boolean>;
  /** apaga os ids numa transação só. */
  protected abstract apagar(loja: Loja, ...ids: string[]): Promise<void>;

  private async salvar(loja: Loja, valor: Registro, esperado?: string): Promise<string> {
    const atualizadoEm = agora();
    // marca única e crescente: data, contador desta aba e a aba (duas abas no mesmo milissegundo nunca empatam)
    const versao = `${atualizadoEm}~${String(++contadorDeGravacoes).padStart(8, '0')}~${ID_DA_ABA}`;
    const r = { ...valor, atualizadoEm, versao };
    if (esperado !== undefined) {
      if (!(await this.gravarSe(loja, r, esperado))) {
        const salvo = await this.ler(loja, valor.id);
        throw new ConflitoDeVersao(valor.id, versaoDe(salvo));
      }
    } else await this.gravarBruto(loja, r);
    void pedirPersistencia();
    avisarOutrasAbas({ tipo: 'salvo', loja, id: valor.id, atualizadoEm, versao, aba: ID_DA_ABA });
    return versao;
  }

  async listarProjetos() {
    return (await this.brutos('projetos')).map(lerProjetoSalvo).sort(porData);
  }
  async lerProjeto(id: string) {
    const r = await this.ler('projetos', id);
    return r ? lerProjetoSalvo(r) : undefined;
  }
  salvarProjeto(p: Projeto, opcoes?: { esperado?: string }) {
    return this.salvar('projetos', p as unknown as Registro, opcoes?.esperado);
  }
  async excluirProjeto(id: string) {
    await this.apagar('projetos', id);
    avisarOutrasAbas({ tipo: 'excluido', loja: 'projetos', id, aba: ID_DA_ABA });
  }
  async listarLayouts() {
    return (await this.brutos('layouts')).map(lerLayoutSalvo).sort(porData);
  }
  async lerLayout(id: string) {
    const r = await this.ler('layouts', id);
    return r ? lerLayoutSalvo(r) : undefined;
  }
  salvarLayout(l: Layout, opcoes?: { esperado?: string }) {
    return this.salvar('layouts', l as unknown as Registro, opcoes?.esperado);
  }
  async excluirLayout(id: string) {
    await this.apagar('layouts', id);
    avisarOutrasAbas({ tipo: 'excluido', loja: 'layouts', id, aba: ID_DA_ABA });
  }
  async listarKits() {
    return (await this.brutos('kits')).map(lerKitSalvo);
  }
  salvarKit(k: BrandKit, opcoes?: { esperado?: string }) {
    return this.salvar('kits', k as unknown as Registro, opcoes?.esperado);
  }
  async salvarArquivo(blob: Blob, nome?: string) {
    const id = novoId('arq');
    const a: Arquivo = { id, ...(nome && { nome }), tipo: blob.type, blob, criadoEm: agora() };
    await this.gravarBruto('arquivos', a as unknown as Registro);
    void pedirPersistencia();
    return id;
  }
  async lerArquivo(id: string) {
    const a = (await this.ler('arquivos', id)) as unknown as Arquivo | undefined;
    return a?.blob;
  }
  async excluirArquivos(ids: string[]) {
    if (ids.length) await this.apagar('arquivos', ...ids);
  }
}

/** Em memória: testes e navegadores sem IndexedDB. */
export class RepositorioMemoria extends Base {
  private lojas = new Map<Loja, Map<string, Registro>>();
  private loja(l: Loja) {
    let m = this.lojas.get(l);
    if (!m) this.lojas.set(l, (m = new Map()));
    return m;
  }
  async brutos(l: Loja) {
    return [...this.loja(l).values()].map((v) => structuredClone(v));
  }
  protected async ler(l: Loja, id: string) {
    const v = this.loja(l).get(id);
    return v === undefined ? undefined : structuredClone(v);
  }
  async gravarBruto(l: Loja, v: Registro) {
    this.loja(l).set(v.id, structuredClone(v));
  }
  protected async gravarSe(l: Loja, v: Registro, esperado: string | undefined) {
    const atual = this.loja(l).get(v.id);
    if (atual && versaoDe(atual) !== esperado) return false;
    this.loja(l).set(v.id, structuredClone(v));
    return true;
  }
  protected async apagar(l: Loja, ...ids: string[]) {
    ids.forEach((id) => this.loja(l).delete(id));
  }
}

const NOME_BANCO = 'aragonez-builder';
const VERSAO_BANCO = 1;

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

/** Gravação só conta como feita quando a transação termina (oncomplete). Rejeita só no onabort: o erro de um pedido
 *  sobe até a transação (onerror) antes do abort, quando tx.error ainda pode ser null; por isso o erro do pedido fica
 *  guardado. Armazenamento cheio rejeita com o erro original do IndexedDB (name QuotaExceededError), nunca null. */
export const concluida = (tx: Pick<IDBTransaction, 'oncomplete' | 'onerror' | 'onabort' | 'error'>) =>
  new Promise<void>((ok, falha) => {
    let erroDoPedido: DOMException | null = null;
    tx.oncomplete = () => ok();
    tx.onerror = (e: Event) => {
      erroDoPedido ??= (e.target as IDBRequest | null)?.error ?? null;
    };
    tx.onabort = () => falha(tx.error ?? erroDoPedido ?? new DOMException('Transação cancelada', 'AbortError'));
  });

/** IndexedDB do navegador (modo local). */
export class RepositorioLocal extends Base {
  private banco: Promise<IDBDatabase>;
  constructor(fabrica: IDBFactory = indexedDB, nome = NOME_BANCO, versao = VERSAO_BANCO) {
    super();
    this.banco = new Promise((ok, falha) => {
      const r = fabrica.open(nome, versao);
      r.onupgradeneeded = () => {
        for (const l of LOJAS)
          if (!r.result.objectStoreNames.contains(l)) r.result.createObjectStore(l, { keyPath: 'id' });
      };
      // outra aba com o banco aberto numa versão antiga impede a atualização: avisa para fechar as outras abas
      r.onblocked = () => avisarAqui({ tipo: 'banco-bloqueado' });
      r.onsuccess = () => {
        const db = r.result;
        // outra aba quer atualizar o banco: fecha esta conexão (não trava a outra) e pede para recarregar
        db.onversionchange = () => {
          db.close();
          avisarAqui({ tipo: 'banco-atualizado' });
        };
        ok(db);
      };
      r.onerror = () => falha(r.error);
    });
  }
  private async transacao(l: Loja, modo: IDBTransactionMode) {
    return (await this.banco).transaction(l, modo).objectStore(l);
  }
  private async escrita(l: Loja) {
    const tx = (await this.banco).transaction(l, 'readwrite');
    return { loja: tx.objectStore(l), fim: concluida(tx) };
  }
  async brutos(l: Loja) {
    return pedido((await this.transacao(l, 'readonly')).getAll()) as Promise<Registro[]>;
  }
  protected async ler(l: Loja, id: string) {
    return pedido((await this.transacao(l, 'readonly')).get(id)) as Promise<Registro | undefined>;
  }
  async gravarBruto(l: Loja, v: Registro) {
    const { loja, fim } = await this.escrita(l);
    loja.put(v);
    await fim;
  }
  protected async gravarSe(l: Loja, v: Registro, esperado: string | undefined) {
    const { loja, fim } = await this.escrita(l);
    // leitura e gravação na mesma transação: outra aba não consegue gravar no meio
    let gravou = false;
    const g = loja.get(v.id);
    g.onsuccess = () => {
      const atual = g.result as Registro | undefined;
      if (atual && versaoDe(atual) !== esperado) return;
      loja.put(v);
      gravou = true;
    };
    await fim;
    return gravou;
  }
  protected async apagar(l: Loja, ...ids: string[]) {
    const { loja, fim } = await this.escrita(l);
    ids.forEach((id) => loja.delete(id));
    await fim;
  }
}

function criarRepositorio(): Repositorio {
  try {
    if (typeof indexedDB !== 'undefined') return new RepositorioLocal();
  } catch {
    /* sem IndexedDB: cai para a memória */
  }
  return new RepositorioMemoria();
}

/** Repositório em uso no app (trocável nos testes e, na Fase 6, no login/logout). Quem guarda dados lidos dele
 *  (ex.: a lista de projetos) zera ao trocar, para nunca mostrar os dados de outra conta. */
let atual: Repositorio = criarRepositorio();
const aoTrocar = new Set<() => void>();
export const repo = {
  get atual(): Repositorio {
    return atual;
  },
  set atual(r: Repositorio) {
    atual = r;
    aoTrocar.forEach((f) => f());
  },
};
export function aoTrocarRepositorio(f: () => void): () => void {
  aoTrocar.add(f);
  return () => aoTrocar.delete(f);
}
