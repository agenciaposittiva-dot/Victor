import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarProjeto } from '@/dados/catalogo';
import { repo, RepositorioMemoria, type AvisoDoBanco } from '@/dados/repositorio';
import { carregarProjetos, ouvirMudancas, useListaDeProjetos } from '@/projetos/listaDeProjetos';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const original = repo.atual;
let r: RepositorioMemoria;
const aviso = (a: AvisoDoBanco) => {
  const c = new BroadcastChannel('aragonez-builder');
  c.postMessage(a);
  c.close();
};
const nomes = () => (useListaDeProjetos.getState().itens ?? []).map((i) => (i.ok ? i.valor.nome : i.nome));

beforeEach(() => {
  r = new RepositorioMemoria();
  repo.atual = r;
  useListaDeProjetos.setState({ itens: null, catalogo: null, erro: null });
});
afterEach(() => {
  repo.atual = original;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('lista de projetos (store)', () => {
  it('abre ordenada (mais recente primeiro) e com erro mostra o motivo', async () => {
    for (const n of ['Velho', 'Meio', 'Novo']) await r.salvarProjeto(criarProjeto(LAYOUT_TESTE, KIT_TESTE, n));
    await carregarProjetos();
    expect(nomes()).toEqual(['Novo', 'Meio', 'Velho']);
    vi.spyOn(r, 'listarProjetos').mockRejectedValueOnce(new Error('sem acesso'));
    await carregarProjetos();
    expect(useListaDeProjetos.getState().erro).toBe('sem acesso');
  });

  it('avisos de outras abas agrupados em 1 s: só o projeto que mudou é relido; os outros mantêm o mesmo objeto', async () => {
    const a = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'A');
    const b = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'B');
    await r.salvarProjeto(a);
    await r.salvarProjeto(b);
    await carregarProjetos();
    const antes = useListaDeProjetos.getState().itens!;
    const objetoDeA = antes.find((i) => i.ok && i.valor.id === a.id);
    const parar = ouvirMudancas();
    const lidos: string[] = [];
    const ler = r.lerProjeto.bind(r);
    vi.spyOn(r, 'lerProjeto').mockImplementation(async (id) => {
      lidos.push(id);
      return ler(id);
    });
    const versao = await r.salvarProjeto({ ...b, nome: 'B renomeado' });
    // três avisos seguidos do mesmo projeto viram uma leitura só
    for (let k = 0; k < 3; k++)
      aviso({ tipo: 'salvo', loja: 'projetos', id: b.id, atualizadoEm: '', versao, aba: 'outra' });
    await new Promise((ok) => setTimeout(ok, 1300));
    expect(lidos).toEqual([b.id]);
    expect(nomes()).toEqual(['B renomeado', 'A']);
    expect(useListaDeProjetos.getState().itens!.find((i) => i.ok && i.valor.id === a.id)).toBe(objetoDeA);
    // excluído em outra aba: sai da lista em até ~1 s
    await r.excluirProjeto(a.id);
    aviso({ tipo: 'excluido', loja: 'projetos', id: a.id, aba: 'outra' });
    await new Promise((ok) => setTimeout(ok, 1300));
    expect(nomes()).toEqual(['B renomeado']);
    parar();
  });
});
