import type { BrandKit, Layout, Projeto } from '@/dominio/schemas';
import { lerKitSalvo, lerLayoutSalvo, lerProjetoSalvo, type Lido } from './migracao';

/** Onde ficam projetos, layouts, kits e arquivos (fotos e logos enviados). No modo local é o IndexedDB do
 *  navegador; na Fase 6 entra a implementação com Supabase, com a mesma interface.
 *  Registros que não validam nem depois da migração continuam aparecendo (ok: false), nunca somem. */
export interface Repositorio {
  listarProjetos(): Promise<Lido<Projeto>[]>;
  lerProjeto(id: string): Promise<Lido<Projeto> | undefined>;
  /** grava e devolve o novo atualizadoEm. Com "esperado", recusa (ConflitoDeVersao) se outra aba salvou antes. */
  salvarProjeto(p: Projeto, opcoes?: { esperado?: string }): Promise<string>;
  excluirProjeto(id: string): Promise<void>;
  listarLayouts(): Promise<Lido<Layout>[]>;
  lerLayout(id: string): Promise<Lido<Layout> | undefined>;
  salvarLayout(l: Layout): Promise<string>;
  excluirLayout(id: string): Promise<void>;
  listarKits(): Promise<Lido<BrandKit>[]>;
  salvarKit(k: BrandKit): Promise<string>;
  salvarArquivo(blob: Blob, nome?: string): Promise<string>;
  lerArquivo(id: string): Promise<Blob | undefined>;
  /** acesso bruto, para o backup (Exportar tudo / Importar). */
  brutos(loja: Loja): Promise<Registro[]>;
  gravarBruto(loja: Loja, r: Registro): Promise<void>;
}

export type Loja = 'projetos' | 'layouts' | 'kits' | 'arquivos';
export const LOJAS: Loja[] = ['projetos', 'layouts', 'kits', 'arquivos'];
export type Registro = { id: string; [k: string]: unknown };
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
  | { tipo: 'salvo'; loja: Loja; id: string; atualizadoEm: string; aba: string }
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

/** Data nova e sempre crescente (dois salvamentos no mesmo milissegundo não ficam com a mesma data). */
let ultimaData = '';
function agora(): string {
  let d = new Date().toISOString();
  if (d <= ultimaData) d = new Date(Date.parse(ultimaData) + 1).toISOString();
  return (ultimaData = d);
}

const porData = <T>(a: Lido<T>, b: Lido<T>) => {
  const da = a.ok ? ((a.valor as { atualizadoEm?: string }).atualizadoEm ?? '') : '';
  const db = b.ok ? ((b.valor as { atualizadoEm?: string }).atualizadoEm ?? '') : '';
  return db.localeCompare(da);
};

abstract class Base implements Repositorio {
  abstract brutos(loja: Loja): Promise<Registro[]>;
  protected abstract ler(loja: Loja, id: string): Promise<Registro | undefined>;
  abstract gravarBruto(loja: Loja, r: Registro): Promise<void>;
  /** grava só se o atualizadoEm salvo for o esperado (na mesma transação); devolve false se não for. */
  protected abstract gravarSe(loja: Loja, r: Registro, esperado: string | undefined): Promise<boolean>;
  protected abstract apagar(loja: Loja, id: string): Promise<void>;

  private async salvar(loja: Loja, valor: Registro, esperado?: string): Promise<string> {
    const atualizadoEm = agora();
    const r = { ...valor, atualizadoEm };
    if (esperado !== undefined) {
      if (!(await this.gravarSe(loja, r, esperado))) {
        const salvo = await this.ler(loja, valor.id);
        throw new ConflitoDeVersao(valor.id, salvo?.atualizadoEm as string | undefined);
      }
    } else await this.gravarBruto(loja, r);
    void pedirPersistencia();
    avisarOutrasAbas({ tipo: 'salvo', loja, id: valor.id, atualizadoEm, aba: ID_DA_ABA });
    return atualizadoEm;
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
  excluirProjeto(id: string) {
    return this.apagar('projetos', id);
  }
  async listarLayouts() {
    return (await this.brutos('layouts')).map(lerLayoutSalvo).sort(porData);
  }
  async lerLayout(id: string) {
    const r = await this.ler('layouts', id);
    return r ? lerLayoutSalvo(r) : undefined;
  }
  salvarLayout(l: Layout) {
    return this.salvar('layouts', l as unknown as Registro);
  }
  excluirLayout(id: string) {
    return this.apagar('layouts', id);
  }
  async listarKits() {
    return (await this.brutos('kits')).map(lerKitSalvo);
  }
  salvarKit(k: BrandKit) {
    return this.salvar('kits', k as unknown as Registro);
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
    if (atual && atual.atualizadoEm !== esperado) return false;
    this.loja(l).set(v.id, structuredClone(v));
    return true;
  }
  protected async apagar(l: Loja, id: string) {
    this.loja(l).delete(id);
  }
}

const NOME_BANCO = 'aragonez-builder';
const VERSAO_BANCO = 1;

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
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
  async brutos(l: Loja) {
    return pedido((await this.transacao(l, 'readonly')).getAll()) as Promise<Registro[]>;
  }
  protected async ler(l: Loja, id: string) {
    return pedido((await this.transacao(l, 'readonly')).get(id)) as Promise<Registro | undefined>;
  }
  async gravarBruto(l: Loja, v: Registro) {
    await pedido((await this.transacao(l, 'readwrite')).put(v));
  }
  protected async gravarSe(l: Loja, v: Registro, esperado: string | undefined) {
    const loja = await this.transacao(l, 'readwrite');
    // leitura e gravação na mesma transação: outra aba não consegue gravar no meio
    return new Promise<boolean>((ok, falha) => {
      const g = loja.get(v.id);
      g.onerror = () => falha(g.error);
      g.onsuccess = () => {
        const atual = g.result as Registro | undefined;
        if (atual && atual.atualizadoEm !== esperado) return ok(false);
        const p = loja.put(v);
        p.onerror = () => falha(p.error);
        p.onsuccess = () => ok(true);
      };
    });
  }
  protected async apagar(l: Loja, id: string) {
    await pedido((await this.transacao(l, 'readwrite')).delete(id));
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

/** Repositório em uso no app (trocável nos testes). */
export const repo: { atual: Repositorio } = { atual: criarRepositorio() };
