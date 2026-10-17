import type { BrandKit, Layout, Projeto } from '@/dominio/schemas';
import { LAYOUT_EM_BRANCO, LAYOUT_EM_BRANCO_CONTINUO } from '@/seeds/basicos';
import { KIT_NEUTRO } from '@/seeds/kits';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';
import { novoId, repo, type Repositorio } from './repositorio';

/** Ferramentas de desenvolvimento (layout e kit de teste, laboratório): ligadas no "npm run dev" ou quando o
 *  navegador tem a marca aragonez:dev=1 (os testes automáticos e o "npm run amostras" ligam). */
export function ferramentasDeDesenvolvimento(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return globalThis.localStorage?.getItem('aragonez:dev') === '1';
  } catch {
    return false;
  }
}

/** Layouts e kits que vêm com o app. O layout e o kit de teste só aparecem no modo de desenvolvimento; a Fase 4a
 *  troca pelos layouts prontos Victor Aragonez e Feira Nova. */
export function layoutsDoApp(): Layout[] {
  return [LAYOUT_EM_BRANCO, LAYOUT_EM_BRANCO_CONTINUO, ...(ferramentasDeDesenvolvimento() ? [LAYOUT_TESTE] : [])];
}
export function kitsDoApp(): BrandKit[] {
  return [KIT_NEUTRO, ...(ferramentasDeDesenvolvimento() ? [KIT_TESTE] : [])];
}

export type Catalogo = { layouts: Layout[]; kits: BrandKit[] };

/** Layouts e kits disponíveis: os do app e os salvos neste navegador ("Salvar como layout"). */
export async function carregarCatalogo(): Promise<Catalogo> {
  const [ls, ks] = await Promise.all([repo.atual.listarLayouts(), repo.atual.listarKits()]);
  const meus = ls.flatMap((l) => (l.ok ? [l.valor] : []));
  const meusKits = ks.flatMap((k) => (k.ok ? [k.valor] : []));
  return {
    layouts: [...meus, ...layoutsDoApp().filter((l) => !meus.some((m) => m.id === l.id))],
    kits: [...meusKits, ...kitsDoApp().filter((k) => !meusKits.some((m) => m.id === k.id))],
  };
}

export const acharLayout = (c: Catalogo, id: string) => c.layouts.find((l) => l.id === id);
/** Kit do projeto. Sem ele, devolve undefined: o editor avisa e bloqueia a exportação até escolher outro kit
 *  (nunca troca de kit em silêncio). */
export const acharKit = (c: Catalogo, id: string) => c.kits.find((k) => k.id === id);

/** Projeto novo a partir de um layout: um slide de cada tipo, na ordem do layout. */
export function criarProjeto(layout: Layout, kit: Pick<BrandKit, 'id'>, nome: string): Projeto {
  return {
    id: novoId('p'),
    nome: nome.trim() || layout.nome,
    layoutId: layout.id,
    brandKitId: kit.id,
    formato: layout.formato,
    slides: layout.tiposDeSlide.map((t) => ({
      id: novoId('s'),
      tipoId: t.id,
      conteudo: {},
      overrides: {},
      camadasExtras: [],
    })),
    faixaOverrides: {},
    faixaExtras: [],
    versaoSchema: 1,
  };
}

/** Excluir layout salvo: se algum projeto usa o layout, não exclui e diz quais são (o layout pode ser arquivado:
 *  some da biblioteca, mas os projetos continuam abrindo). */
export async function excluirLayout(
  r: Repositorio,
  id: string,
): Promise<{ excluido: true } | { excluido: false; projetos: { id: string; nome: string }[] }> {
  // inclui os projetos que precisam de atualização (lidos pelo layoutId do registro bruto)
  const usando = (await r.listarProjetos())
    .map((p) => {
      if (p.ok) return { id: p.valor.id, nome: p.valor.nome, layoutId: p.valor.layoutId as unknown };
      const bruto = (p.bruto ?? {}) as Record<string, unknown>;
      return { id: p.id, nome: `${p.nome} (precisa de atualização)`, layoutId: bruto.layoutId };
    })
    .filter((p) => p.layoutId === id)
    .map(({ id: pid, nome }) => ({ id: pid, nome }));
  if (usando.length) return { excluido: false, projetos: usando };
  await r.excluirLayout(id);
  return { excluido: true };
}

/** Arquivar layout: continua salvo (os projetos abrem), mas sai da biblioteca e do "Novo projeto". */
export async function arquivarLayout(r: Repositorio, id: string): Promise<void> {
  const l = await r.lerLayout(id);
  if (!l?.ok) throw new Error('Layout não encontrado ou precisa de atualização.');
  await r.salvarLayout({ ...l.valor, status: 'arquivado' });
}
