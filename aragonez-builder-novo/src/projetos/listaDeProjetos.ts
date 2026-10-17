import { create } from 'zustand';
import { carregarCatalogo, type Catalogo } from '@/dados/catalogo';
import type { Lido } from '@/dados/migracao';
import { aoTrocarRepositorio, ouvirBanco, repo } from '@/dados/repositorio';
import type { Projeto } from '@/dominio/schemas';

/** Lista de projetos fora dos componentes: carregar e atualizar ficam aqui. Avisos do banco (outra aba salvou)
 *  são agrupados em 1 s e só os projetos que mudaram são relidos; os outros mantêm o mesmo objeto (as miniaturas
 *  memorizadas não redesenham). */
type Estado = {
  itens: Lido<Projeto>[] | null;
  catalogo: Catalogo | null;
  erro: string | null;
};

export const useListaDeProjetos = create<Estado>()(() => ({ itens: null, catalogo: null, erro: null }));
// outro repositório (testes; login e logout na Fase 6): a lista é zerada e carregada de novo
aoTrocarRepositorio(() => useListaDeProjetos.setState({ itens: null, catalogo: null, erro: null }));

const idDe = (i: Lido<Projeto>) => (i.ok ? i.valor.id : i.id);
const dataDe = (i: Lido<Projeto>) => (i.ok ? `${i.valor.atualizadoEm ?? ''}|${i.valor.versao ?? ''}` : '');
const ordenar = (itens: Lido<Projeto>[]) => [...itens].sort((a, b) => dataDe(b).localeCompare(dataDe(a)));

export async function carregarProjetos(): Promise<void> {
  try {
    const [itens, catalogo] = await Promise.all([repo.atual.listarProjetos(), carregarCatalogo()]);
    useListaDeProjetos.setState({ itens: ordenar(itens), catalogo, erro: null });
  } catch (e) {
    useListaDeProjetos.setState({ erro: e instanceof Error ? e.message : String(e) });
  }
}

/** Relê só estes projetos (e o catálogo, se um layout mudou). Quem não mudou continua com o mesmo objeto. */
export async function atualizarProjetos(ids: Iterable<string>, layoutsMudaram = false): Promise<void> {
  try {
    const lidos = await Promise.all(
      [...new Set(ids)].map(async (id) => [id, await repo.atual.lerProjeto(id)] as const),
    );
    const catalogo = layoutsMudaram ? await carregarCatalogo() : useListaDeProjetos.getState().catalogo;
    const atuais = useListaDeProjetos.getState().itens ?? [];
    const porId = new Map(atuais.map((i) => [idDe(i), i]));
    for (const [id, lido] of lidos) {
      if (lido) porId.set(id, lido);
      else porId.delete(id); // excluído
    }
    useListaDeProjetos.setState({ itens: ordenar([...porId.values()]), catalogo, erro: null });
  } catch (e) {
    useListaDeProjetos.setState({ erro: e instanceof Error ? e.message : String(e) });
  }
}

export const removerDaLista = (id: string) =>
  useListaDeProjetos.setState((s) => ({ itens: s.itens?.filter((i) => idDe(i) !== id) ?? null }));

/** Ouve os avisos de outras abas enquanto alguma lista está na tela (agrupados em 1 s). */
let ouvindo = 0;
let pararDeOuvir: (() => void) | null = null;
export function ouvirMudancas(): () => void {
  if (ouvindo++ === 0) {
    const pendentes = new Set<string>();
    let layouts = false;
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const parar = ouvirBanco((a) => {
      if (a.tipo !== 'salvo' && a.tipo !== 'excluido') return;
      // projeto excluído em outra aba: relido, não existe mais e sai da lista
      if (a.loja === 'projetos') pendentes.add(a.id);
      else if (a.loja === 'layouts' || a.loja === 'kits') layouts = true;
      clearTimeout(tempo);
      tempo = setTimeout(() => {
        const ids = [...pendentes];
        pendentes.clear();
        const l = layouts;
        layouts = false;
        void atualizarProjetos(ids, l);
      }, 1000);
    });
    pararDeOuvir = () => {
      clearTimeout(tempo);
      parar();
    };
  }
  return () => {
    if (--ouvindo === 0) {
      pararDeOuvir?.();
      pararDeOuvir = null;
    }
  };
}
