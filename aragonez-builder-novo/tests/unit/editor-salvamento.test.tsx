import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROTAS } from '@/app/rotas';
import { criarProjeto } from '@/dados/catalogo';
import { ID_DA_ABA, repo, RepositorioMemoria, type AvisoDoBanco } from '@/dados/repositorio';
import type { CamadaTexto, Projeto } from '@/dominio/schemas';
import { editor, useEditor } from '@/editor/estado';
import { acharCamada } from '@/editor/operacoes';
import { esperarSalvamentos, salvarAgora } from '@/editor/salvamento';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const original = repo.atual;
let r: RepositorioMemoria;
const titulo = (p?: { ok: boolean; valor?: Projeto } | undefined) =>
  p?.ok ? (p.valor!.slides[0]!.conteudo.titulo as string | undefined) : undefined;

async function abrirNovo(nome = 'Projeto') {
  const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, nome);
  await r.salvarProjeto(p);
  const router = createMemoryRouter(ROTAS, { initialEntries: [`/editor/${p.id}`] });
  render(<RouterProvider router={router} />);
  await screen.findByTestId('editor');
  return { p, router };
}
const editarTitulo = (texto: string) =>
  act(() =>
    editor.editar('Editar texto', (d) => {
      (acharCamada(d.doc, 0, 'titulo') as CamadaTexto).texto = texto;
    }),
  );
/** Simula o aviso que outra aba mandaria pelo BroadcastChannel. */
function avisoDeOutraAba(a: AvisoDoBanco) {
  const canal = new BroadcastChannel('aragonez-builder');
  canal.postMessage(a);
  canal.close();
}

beforeEach(() => {
  r = new RepositorioMemoria();
  repo.atual = r;
});
afterEach(async () => {
  await esperarSalvamentos();
  repo.atual = original;
  vi.restoreAllMocks();
});

describe('salvamento do editor', () => {
  it('duas chamadas de salvarAgora ao mesmo tempo, sem outra aba, terminam sem conflito', async () => {
    const { p } = await abrirNovo();
    await editarTitulo('Primeira');
    const a = salvarAgora();
    await editarTitulo('Segunda');
    const b = salvarAgora();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(useEditor.getState().salvamento).toBe('salvo');
    expect(titulo(await r.lerProjeto(p.id))).toBe('Segunda');
  });

  it('esconder a aba (visibilitychange hidden) com edição pendente salva na hora, sem esperar', async () => {
    const { p } = await abrirNovo();
    await editarTitulo('Antes de esconder');
    const visivel = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await esperarSalvamentos();
    visivel.mockRestore();
    expect(titulo(await r.lerProjeto(p.id))).toBe('Antes de esconder');
  });

  it('editar durante um salvamento em andamento e sair do editor: ao reabrir, aparece a última edição', async () => {
    const { p, router } = await abrirNovo();
    let soltar = () => {};
    const salvar = r.salvarProjeto.bind(r);
    vi.spyOn(r, 'salvarProjeto').mockImplementationOnce(async (...args) => {
      await new Promise<void>((ok) => (soltar = ok));
      return salvar(...args);
    });
    await editarTitulo('Primeira versão');
    const emAndamento = salvarAgora();
    await editarTitulo('Última versão');
    await act(() => router.navigate('/editor')); // sai do editor (o estado é limpo)
    expect(useEditor.getState().projeto).toBeNull();
    soltar();
    await emAndamento;
    await esperarSalvamentos();
    await waitFor(async () => expect(titulo(await r.lerProjeto(p.id))).toBe('Última versão'));
  });

  it('com conflito em aberto, clicar em voltar guarda a versão desta aba como cópia', async () => {
    const { p } = await abrirNovo('Original');
    // outra aba salva o projeto
    const lido = await r.lerProjeto(p.id);
    const base = lido?.ok ? lido.valor : p;
    await r.salvarProjeto({ ...base, nome: 'Da outra aba' });
    await editarTitulo('Minha versão');
    await act(() => salvarAgora());
    expect(await screen.findByTestId('aviso-conflito')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Voltar aos projetos' }));
    expect(
      await screen.findByText('Suas mudanças foram salvas como cópia: Original (cópia não salva)'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Original (cópia não salva)' })).toBeInTheDocument();
    await waitFor(async () => {
      const todos = (await r.listarProjetos()).flatMap((x) => (x.ok ? [x.valor] : []));
      expect(todos.map((x) => x.nome).sort()).toEqual(['Da outra aba', 'Original (cópia não salva)']);
      expect(titulo({ ok: true, valor: todos.find((x) => x.nome.endsWith('(cópia não salva)')) })).toBe('Minha versão');
    });
  });

  it('renomear na lista e reabrir não dá conflito falso', async () => {
    const { p, router } = await abrirNovo('Nome antigo');
    await editarTitulo('Editado');
    await act(() => router.navigate('/editor'));
    await esperarSalvamentos();
    // renomeia pela lista (outra gravação do mesmo projeto, fora do editor)
    const lido = await r.lerProjeto(p.id);
    const base = lido?.ok ? lido.valor : p;
    await r.salvarProjeto({ ...base, nome: 'Nome novo' });
    await act(() => router.navigate(`/editor/${p.id}`));
    await waitFor(() => expect(useEditor.getState().nome).toBe('Nome novo'));
    await editarTitulo('Depois de renomear');
    expect(await act(() => salvarAgora())).toBe(true);
    expect(useEditor.getState().salvamento).toBe('salvo');
    await act(() => router.navigate('/editor'));
    await esperarSalvamentos();
    const fim = (await r.listarProjetos()).flatMap((x) => (x.ok ? [x.valor] : []));
    expect(fim).toHaveLength(1); // sem cópia de conflito
    expect(titulo({ ok: true, valor: fim[0] })).toBe('Depois de renomear');
  });

  it('Esc na edição de texto com o salvamento automático no meio: volta ao texto de antes e salva de novo', async () => {
    const { p } = await abrirNovo();
    const antes = (acharCamada(useEditor.getState().doc, 0, 'titulo') as CamadaTexto).texto;
    const captura = editor.capturar(); // abrir a edição no canvas
    await editarTitulo('Digitado e cancelado');
    await act(() => salvarAgora()); // o salvamento automático rodou no meio
    expect(titulo(await r.lerProjeto(p.id))).toBe('Digitado e cancelado');
    act(() => editor.restaurar(captura)); // Esc
    expect(useEditor.getState().salvamento).toBe('pendente');
    act(() => editor.desfazer()); // Ctrl+Z depois do Esc não traz o texto cancelado
    expect((acharCamada(useEditor.getState().doc, 0, 'titulo') as CamadaTexto).texto).toBe(antes);
    expect(await act(() => salvarAgora())).toBe(true);
    expect(titulo(await r.lerProjeto(p.id))).toBeUndefined(); // de volta ao texto do layout
  });

  it('projeto excluído em outra aba: nada é salvo até a escolha; "Salvar como projeto novo" cria a cópia com as mudanças', async () => {
    const { p } = await abrirNovo('Vai sumir');
    await editarTitulo('Mudança desta aba');
    await r.excluirProjeto(p.id);
    act(() => avisoDeOutraAba({ tipo: 'excluido', loja: 'projetos', id: p.id, aba: 'outra-' + ID_DA_ABA }));
    expect(await screen.findByTestId('aviso-excluido')).toBeInTheDocument();
    expect(await act(() => salvarAgora())).toBe(false);
    expect(await r.listarProjetos()).toHaveLength(0); // não recriou em silêncio
    await userEvent.click(screen.getByRole('button', { name: 'Salvar como projeto novo' }));
    await waitFor(async () => expect(await r.listarProjetos()).toHaveLength(1));
    const [copia] = (await r.listarProjetos()).flatMap((x) => (x.ok ? [x.valor] : []));
    expect(copia!.id).not.toBe(p.id);
    expect(copia!.nome).toBe('Vai sumir (recuperado)');
    expect(titulo({ ok: true, valor: copia })).toBe('Mudança desta aba');
  });

  it('excluído em outra aba, editar e voltar: a edição vira cópia "recuperado"', async () => {
    const { p } = await abrirNovo('Some');
    await r.excluirProjeto(p.id);
    act(() => avisoDeOutraAba({ tipo: 'excluido', loja: 'projetos', id: p.id, aba: 'outra-' + ID_DA_ABA }));
    await screen.findByTestId('aviso-excluido');
    await editarTitulo('Editado depois de excluído');
    await userEvent.click(screen.getByRole('link', { name: 'Voltar aos projetos' }));
    expect(await screen.findByText('Suas mudanças foram salvas como cópia: Some (recuperado)')).toBeInTheDocument();
    const todos = (await r.listarProjetos()).flatMap((x) => (x.ok ? [x.valor] : []));
    expect(todos.map((x) => [x.nome, titulo({ ok: true, valor: x })])).toEqual([
      ['Some (recuperado)', 'Editado depois de excluído'],
    ]);
  });

  it('"Fechar sem salvar" não cria nada', async () => {
    const { p } = await abrirNovo('Some de vez');
    await editarTitulo('Descartado');
    await r.excluirProjeto(p.id);
    act(() => avisoDeOutraAba({ tipo: 'excluido', loja: 'projetos', id: p.id, aba: 'outra-' + ID_DA_ABA }));
    await screen.findByTestId('aviso-excluido');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar sem salvar' }));
    await screen.findByRole('heading', { level: 1, name: /Editor visual/ });
    await esperarSalvamentos();
    await new Promise((ok) => setTimeout(ok, 50));
    expect(await r.listarProjetos()).toHaveLength(0);
  });
});
