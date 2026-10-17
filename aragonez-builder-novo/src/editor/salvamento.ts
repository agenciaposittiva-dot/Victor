import { useEffect } from 'react';
import { acharKit, acharLayout, carregarCatalogo } from '@/dados/catalogo';
import { ConflitoDeVersao, ID_DA_ABA, novoId, ouvirBanco, repo, versaoDe } from '@/dados/repositorio';
import type { Projeto } from '@/dominio/schemas';
import { editor, projetoAtual, useEditor } from './estado';

/** Salvamento automático do projeto aberto: 600 ms depois da última mudança (na hora, ao esconder a aba, fechar a
 *  página ou sair do editor). Os salvamentos entram numa fila (um de cada vez, cada um com a versão deixada pelo
 *  anterior). Se outra aba salvou o mesmo projeto antes (ConflitoDeVersao), para de tentar e pergunta o que fazer:
 *  nunca repete em loop nem descarta em silêncio. */
export const ESPERA_MS = 600;
/** Marca do erro de armazenamento cheio (QuotaExceededError, o mais provável no iPhone): o aviso explica em português. */
export const ERRO_ARMAZENAMENTO_CHEIO = 'armazenamento-cheio';
export const armazenamentoCheio = (e: unknown) => {
  const x = e as { name?: unknown; message?: unknown } | null;
  return !!x && (x.name === 'QuotaExceededError' || /quota/i.test(String(x.name)) || /quota/i.test(String(x.message)));
};
let temporizador: ReturnType<typeof setTimeout> | undefined;
let emAndamento: Promise<boolean> | null = null;
/** Última versão salva de cada projeto (sobrevive ao editor ser fechado e o estado limpo). */
const versoes = new Map<string, string>();

/** Espera os salvamentos em andamento (fila). */
export async function esperarSalvamentos() {
  while (emAndamento) await emAndamento;
}

export async function salvarAgora(op: { sobrescrever?: boolean } = {}): Promise<boolean> {
  clearTimeout(temporizador);
  // um de cada vez: duas chamadas juntas não podem sair com a mesma versão (seria um conflito falso)
  while (emAndamento) await emAndamento;
  const s = useEditor.getState();
  const p = projetoAtual(s);
  if (!p || !s.projeto) return false;
  // projeto excluído em outra aba: nada é salvo (nem recriado em silêncio) até a pessoa escolher
  if (s.excluidoEmOutraAba) return false;
  if (s.salvamento === 'salvo' && !op.sobrescrever) return true;
  if (s.salvamento === 'conflito' && !op.sobrescrever) return false;
  const inicio = { doc: s.doc, nome: s.nome, guias: s.guias, kit: s.projeto.brandKitId };
  // enquanto o editor está aberto, a versão de referência é a do estado (aberto agora ou salvo por último)
  const esperado = s.versaoSalva;
  useEditor.setState({ salvamento: 'salvando' });
  const tarefa = (async () => {
    try {
      const versao = await repo.atual.salvarProjeto(p, op.sobrescrever ? undefined : { esperado });
      versoes.set(p.id, versao);
      const agora = useEditor.getState();
      if (agora.projeto?.id !== p.id) return true; // o editor já foi fechado ou trocou de projeto
      const mudouDurante =
        agora.doc !== inicio.doc ||
        agora.nome !== inicio.nome ||
        agora.guias !== inicio.guias ||
        agora.projeto.brandKitId !== inicio.kit;
      useEditor.setState({
        versaoSalva: versao,
        projeto: { ...agora.projeto, versao },
        salvamento: mudouDurante ? 'pendente' : 'salvo',
        erroAoSalvar: undefined,
        alteradoEmOutraAba: false,
      });
      if (mudouDurante) agendar();
      return true;
    } catch (e) {
      if (useEditor.getState().projeto?.id !== p.id) throw e;
      if (e instanceof ConflitoDeVersao) useEditor.setState({ salvamento: 'conflito' });
      else
        useEditor.setState({
          salvamento: 'erro',
          erroAoSalvar: armazenamentoCheio(e)
            ? ERRO_ARMAZENAMENTO_CHEIO
            : e instanceof Error
              ? e.message
              : String((e as { message?: unknown })?.message ?? e),
        });
      return false;
    }
  })();
  emAndamento = tarefa;
  try {
    return await tarefa;
  } finally {
    if (emAndamento === tarefa) emAndamento = null;
  }
}

function agendar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void salvarAgora(), ESPERA_MS);
}

const temMudancaPendente = () => {
  const st = useEditor.getState().salvamento;
  return st === 'pendente' || st === 'salvando' || st === 'erro';
};

/** Ao sair do editor: guarda a última versão do projeto agora (antes de o estado ser limpo) e grava depois dos
 *  salvamentos em andamento. Se outra aba salvou no meio, a última edição vira uma cópia (nada se perde). */
export async function salvarAoSair(): Promise<{ copia?: string }> {
  clearTimeout(temporizador);
  const s = useEditor.getState();
  // "salvo" inclui o "Fechar sem salvar" (que marca salvo de propósito)
  if (s.salvamento === 'salvo') return {};
  const p = projetoAtual(s);
  if (!p) return {};
  const copiaDe = (x: Projeto, sufixo: string): Projeto => ({ ...x, id: novoId('p'), nome: `${x.nome} (${sufixo})` });
  // excluído em outra aba ou conflito em aberto: a versão desta aba vira cópia (nada se perde nem é recriado)
  if (s.excluidoEmOutraAba || s.salvamento === 'conflito') {
    const c = copiaDe(p, s.excluidoEmOutraAba ? 'recuperado' : 'cópia não salva');
    await repo.atual.salvarProjeto(c);
    return { copia: c.nome };
  }
  const versaoNaSaida = s.versaoSalva;
  await esperarSalvamentos();
  const esperado = versoes.get(p.id) ?? versaoNaSaida;
  try {
    versoes.set(p.id, await repo.atual.salvarProjeto(p, { esperado }));
    return {};
  } catch (e) {
    if (!(e instanceof ConflitoDeVersao)) throw e;
    const c = copiaDe(p, 'cópia não salva');
    await repo.atual.salvarProjeto(c);
    return { copia: c.nome };
  }
}

/** O editor abriu o projeto nesta versão (a referência para salvar ao sair começa daqui, não de uma sessão antiga). */
export const registrarVersaoAberta = (id: string, versao: string | undefined) => {
  if (versao) versoes.set(id, versao);
  else versoes.delete(id);
};

/** Liga o salvamento automático, o salvamento ao sair e o aviso de "salvo em outra aba" enquanto o editor está aberto. */
export function useSalvamentoAutomatico() {
  useEffect(() => {
    const parar = useEditor.subscribe((s, ant) => {
      const mudou =
        s.doc !== ant.doc ||
        s.nome !== ant.nome ||
        s.guias !== ant.guias ||
        s.projeto?.brandKitId !== ant.projeto?.brandKitId;
      if (s.salvamento === 'pendente' && mudou) agendar();
    });
    const pararBanco = ouvirBanco((a) => {
      const s = useEditor.getState();
      if (
        (a.tipo !== 'salvo' && a.tipo !== 'excluido') ||
        a.loja !== 'projetos' ||
        a.aba === ID_DA_ABA ||
        a.id !== s.projeto?.id
      )
        return;
      if (a.tipo === 'excluido') {
        // excluído em outra aba: para o salvamento automático até a pessoa escolher
        clearTimeout(temporizador);
        useEditor.setState({ excluidoEmOutraAba: true });
      } else if (a.versao !== s.versaoSalva) useEditor.setState({ alteradoEmOutraAba: true });
    });
    // o Safari do iPhone não dispara beforeunload: ao esconder a aba ou trocar de página, salva na hora
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden' && temMudancaPendente()) void salvarAgora();
    };
    const aoSairDaPagina = () => temMudancaPendente() && void salvarAgora();
    const antesDeFechar = (e: BeforeUnloadEvent) => {
      if (!temMudancaPendente() && useEditor.getState().salvamento !== 'conflito') return;
      void salvarAgora();
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', aoSairDaPagina);
    window.addEventListener('beforeunload', antesDeFechar);
    return () => {
      parar();
      pararBanco();
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', aoSairDaPagina);
      window.removeEventListener('beforeunload', antesDeFechar);
    };
  }, []);
}

/** Conflito: abrir a versão salva pela outra aba (as mudanças desta aba são descartadas). */
export async function abrirVersaoSalva(): Promise<boolean> {
  const s = useEditor.getState();
  if (!s.projeto) return false;
  const lido = await repo.atual.lerProjeto(s.projeto.id);
  if (!lido?.ok) return false;
  const catalogo = await carregarCatalogo();
  const layout = acharLayout(catalogo, lido.valor.layoutId) ?? s.layout;
  if (!layout) return false;
  const versao = versaoDe(lido.valor);
  registrarVersaoAberta(lido.valor.id, versao);
  editor.carregar({
    projeto: lido.valor,
    layout,
    kit: acharKit(catalogo, lido.valor.brandKitId) ?? null,
    versao,
    modo: s.modo,
  });
  return true;
}

/** Conflito: manter a versão desta aba (salva por cima da outra). */
export const manterEstaVersao = () => salvarAgora({ sobrescrever: true });

/** Conflito: salvar a versão desta aba como um projeto novo e abri-lo no editor (a da outra aba fica como está).
 *  Devolve o id da cópia (a tela troca o endereço para ela). */
export async function salvarComoCopia(sufixo = 'cópia'): Promise<string | null> {
  await esperarSalvamentos();
  const s = useEditor.getState();
  const p = projetoAtual(s);
  if (!p || !s.layout) return null;
  const copia: Projeto = { ...p, id: novoId('p'), nome: `${p.nome} (${sufixo})` };
  const versao = await repo.atual.salvarProjeto(copia);
  versoes.set(copia.id, versao);
  editor.carregar({ projeto: { ...copia, versao }, layout: s.layout, kit: s.kit, versao, modo: s.modo });
  return copia.id;
}

/** Só para os testes. */
export const _estadoDoSalvamento = { versoes };

/** Projeto excluído em outra aba: fechar sem salvar (as mudanças desta aba são descartadas). */
export function fecharSemSalvar() {
  clearTimeout(temporizador);
  useEditor.setState({ salvamento: 'salvo' });
}
