import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROTAS } from '@/app/rotas';
import { criarProjeto } from '@/dados/catalogo';
import { repo, RepositorioMemoria } from '@/dados/repositorio';
import type { CamadaTexto, Projeto } from '@/dominio/schemas';
import { editor, useEditor } from '@/editor/estado';
import { acharCamada } from '@/editor/operacoes';
import { esperarSalvamentos, salvarAgora } from '@/editor/salvamento';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const original = repo.atual;
let r: RepositorioMemoria;

async function novoProjeto(nome = 'Projeto', mudar?: (p: Projeto) => void) {
  const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, nome);
  mudar?.(p);
  await r.salvarProjeto(p);
  return p;
}
const lerTitulo = async (id: string) => {
  const p = await r.lerProjeto(id);
  return p?.ok ? p.valor.slides[0]!.conteudo.titulo : undefined;
};
function abrir(rota: string, estrito = false) {
  const router = createMemoryRouter(ROTAS, { initialEntries: [rota] });
  const ui = <RouterProvider router={router} />;
  render(estrito ? <StrictMode>{ui}</StrictMode> : ui);
  return router;
}
const editarTitulo = (texto: string) =>
  act(() =>
    editor.editar('Editar texto', (d) => {
      const c = acharCamada(d.doc, 0, 'titulo') as CamadaTexto;
      c.texto = texto;
    }),
  );

beforeEach(() => {
  r = new RepositorioMemoria();
  repo.atual = r;
});
afterEach(async () => {
  await esperarSalvamentos();
  repo.atual = original;
  vi.restoreAllMocks();
});

describe('tela do editor', () => {
  it('abre com StrictMode (monta, desmonta e monta de novo) e mostra os campos', async () => {
    const p = await novoProjeto('Estrito');
    abrir(`/editor/${p.id}`, true);
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(await screen.findByLabelText('Título')).toHaveValue('Prompt bonito\nnão paga *boleto.*');
    expect(screen.getByLabelText('Título')).toHaveAccessibleDescription('30/60');
    expect(useEditor.getState().projeto?.id).toBe(p.id);
  });

  it('o campo é achado pelo nome também sem o StrictMode', async () => {
    const p = await novoProjeto('Sem estrito');
    abrir(`/editor/${p.id}`);
    expect(await screen.findByLabelText('Título')).toHaveValue('Prompt bonito\nnão paga *boleto.*');
  });

  it('editar e clicar em voltar salva', async () => {
    const p = await novoProjeto();
    abrir(`/editor/${p.id}`);
    await screen.findByTestId('editor');
    await editarTitulo('Mudou e voltou');
    await userEvent.click(screen.getByRole('link', { name: 'Voltar aos projetos' }));
    await waitFor(async () => expect(await lerTitulo(p.id)).toBe('Mudou e voltou'));
  });

  it('trocar de /editor/A para /editor/B com edição pendente salva o A', async () => {
    const a = await novoProjeto('A');
    const b = await novoProjeto('B');
    const router = abrir(`/editor/${a.id}`);
    await screen.findByTestId('editor');
    await editarTitulo('Título do A');
    await act(() => router.navigate(`/editor/${b.id}`));
    await waitFor(() => expect(useEditor.getState().projeto?.id).toBe(b.id));
    await waitFor(async () => expect(await lerTitulo(a.id)).toBe('Título do A'));
    expect(await lerTitulo(b.id)).toBeUndefined();
  });

  it('erro ao abrir mostra "Tentar de novo", nunca "Abrindo" para sempre', async () => {
    const p = await novoProjeto();
    const falha = vi.spyOn(r, 'lerProjeto').mockRejectedValueOnce(new Error('banco indisponível'));
    abrir(`/editor/${p.id}`);
    expect(await screen.findByText('Não consegui abrir o projeto')).toBeInTheDocument();
    falha.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
  });

  it('armazenamento cheio (QuotaExceededError original) mostra o aviso em português', async () => {
    const p = await novoProjeto();
    abrir(`/editor/${p.id}`);
    await screen.findByTestId('editor');
    vi.spyOn(r, 'salvarProjeto').mockRejectedValue(new DOMException('x', 'QuotaExceededError'));
    await editarTitulo('Não cabe');
    await act(() => salvarAgora());
    expect(await screen.findByText('O armazenamento deste navegador está cheio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar tudo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver projetos' })).toBeInTheDocument();
  });

  it('projeto sem kit: aviso fixo, exportação bloqueada; escolher um kit salva o kit no projeto', async () => {
    const p = await novoProjeto('Sem kit', (x) => void (x.brandKitId = 'kit-apagado'));
    abrir(`/editor/${p.id}`);
    expect(await screen.findByTestId('aviso-kit')).toBeInTheDocument();
    expect(screen.getByTestId('exportar')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Escolher um kit' }));
    await userEvent.selectOptions(await screen.findByLabelText('Brand Kit'), 'kit-teste');
    await userEvent.click(screen.getByRole('button', { name: 'Usar este kit' }));
    await waitFor(() => expect(screen.queryByTestId('aviso-kit')).not.toBeInTheDocument());
    expect(screen.getByTestId('exportar')).not.toBeDisabled();
    await act(() => salvarAgora());
    const salvo = await r.lerProjeto(p.id);
    expect(salvo?.ok && salvo.valor.brandKitId).toBe('kit-teste');
  });

  it('foto que termina de carregar depois de abrir aparece sem editar nada', async () => {
    let liberar: (b: Blob) => void = () => {};
    const arqId = await r.salvarArquivo(new Blob(['foto'], { type: 'image/png' }));
    const p = await novoProjeto('Foto', (x) => {
      x.slides[0]!.overrides = { foto: { assetId: arqId, url: null } };
    });
    vi.spyOn(r, 'lerArquivo').mockImplementation(() => new Promise((ok) => (liberar = ok)));
    abrir(`/editor/${p.id}`);
    await screen.findByTestId('editor');
    const foto = () => document.querySelector('[data-testid="canvas"] [data-camada="foto"] img');
    expect(foto()).toBeNull(); // ainda carregando: espaço vazio
    await act(async () => liberar(new Blob(['foto'], { type: 'image/png' })));
    await waitFor(() => expect(foto()).not.toBeNull());
    expect(foto()!.getAttribute('src')).toMatch(/^blob:/);
  });
});
