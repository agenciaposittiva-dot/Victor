import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROTAS } from '@/app/rotas';
import { criarProjeto } from '@/dados/catalogo';
import { novoId, repo, RepositorioMemoria } from '@/dados/repositorio';
import { esperarSalvamentos } from '@/editor/salvamento';
import { useVista } from '@/editor/vista';
import { exportar } from '@/exportar/exportar';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

vi.mock('@/exportar/exportar', async (original) => {
  const real = await original<typeof import('@/exportar/exportar')>();
  const pronto = async () => ({
    arquivos: [{ nome: 'teste.zip', blob: new Blob(['x']) }],
    fontesFaltando: [],
    arquivosFaltando: [],
  });
  return { ...real, exportar: vi.fn(pronto), gerarArquivos: vi.fn(pronto) };
});

/** Memória com os arquivos num Map (no Node, o structuredClone não preserva o Blob; no navegador preserva). */
class RepoComArquivos extends RepositorioMemoria {
  private blobs = new Map<string, Blob>();
  override async salvarArquivo(b: Blob) {
    const id = novoId('arq');
    this.blobs.set(id, b);
    return id;
  }
  override async lerArquivo(id: string) {
    return this.blobs.get(id);
  }
}

const original = repo.atual;
let r: RepoComArquivos;
beforeEach(() => {
  r = new RepoComArquivos();
  repo.atual = r;
});
afterEach(async () => {
  await esperarSalvamentos();
  repo.atual = original;
  vi.clearAllMocks();
});

/** Projeto do layout de teste com a foto já trocada (nada a conferir antes de exportar). */
async function abrirProjetoPronto() {
  const arq = await r.salvarArquivo(new Blob(['foto'], { type: 'image/png' }));
  const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Pronto');
  p.slides[0]!.conteudo.foto = { assetId: arq };
  await r.salvarProjeto(p);
  render(<RouterProvider router={createMemoryRouter(ROTAS, { initialEntries: [`/editor/${p.id}`] })} />);
  await screen.findByTestId('editor');
}

describe('barra de espaço (38)', () => {
  it('Tab até Exportar e espaço exporta', async () => {
    await abrirProjetoPronto();
    const botao = screen.getByTestId('exportar');
    for (let i = 0; i < 60 && document.activeElement !== botao; i++) await userEvent.tab();
    expect(document.activeElement).toBe(botao);
    await userEvent.keyboard(' ');
    await waitFor(() => expect(exportar).toHaveBeenCalledTimes(1));
  });

  it('vira "mover a vista" só com o foco no canvas ou no body; em botões, o espaço funciona normal', async () => {
    await abrirProjetoPronto();
    // body: o espaço é do canvas (a página não rola)
    expect(fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })).toBe(false);
    fireEvent.keyUp(document.body, { code: 'Space', key: ' ' });
    // botão, rádio do modo: o espaço continua sendo do controle
    expect(fireEvent.keyDown(screen.getByTestId('exportar'), { code: 'Space', key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole('radio', { name: 'Conteúdo' }), { code: 'Space', key: ' ' })).toBe(true);
  });
});

describe('menu "+ Slide" (39)', () => {
  it('abre com o foco no primeiro tipo, fecha com Esc (o foco volta ao botão) e com clique fora', async () => {
    await abrirProjetoPronto();
    const botao = screen.getByRole('button', { name: 'Slide' });
    await userEvent.click(botao);
    const menu = screen.getByRole('menu', { name: 'Tipo do slide novo' });
    const itens = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(itens[0]);
    // setas andam entre os tipos
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(itens[1]);
    await userEvent.keyboard('{Escape}');
    expect(menu).not.toBeInTheDocument();
    expect(document.activeElement).toBe(botao);

    await userEvent.click(botao);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('canvas'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('pinça (37)', () => {
  const gesto = (el: Element, scale: number) => {
    const e = new Event('gesturechange', { cancelable: true });
    Object.assign(e, { scale, clientX: 100, clientY: 100 });
    el.dispatchEvent(e);
    return e;
  };

  it('no trackpad do Mac (sem toque), o gesturechange faz o zoom', async () => {
    await abrirProjetoPronto();
    const area = screen.getByTestId('canvas');
    const antes = useVista.getState().zoom;
    act(() => void area.dispatchEvent(new Event('gesturestart', { cancelable: true })));
    let e!: Event;
    act(() => void (e = gesto(area, 2)));
    expect(e.defaultPrevented).toBe(true);
    expect(useVista.getState().zoom).toBeCloseTo(antes * 2, 5);
  });

  it('com dedos na tela (iPhone/iPad), o gesturechange só impede o zoom da página: o zoom vem dos ponteiros, uma vez só', async () => {
    await abrirProjetoPronto();
    const area = screen.getByTestId('canvas');
    const antes = useVista.getState().zoom;
    fireEvent.pointerDown(area, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(area, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100, button: 0 });
    act(() => void area.dispatchEvent(new Event('gesturestart', { cancelable: true })));
    let e!: Event;
    act(() => void (e = gesto(area, 2)));
    expect(e.defaultPrevented).toBe(true);
    expect(useVista.getState().zoom).toBe(antes);
    // os dois dedos se afastam até o dobro da distância: zoom 2×, não 4×
    fireEvent.pointerMove(area, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 });
    expect(useVista.getState().zoom).toBeCloseTo(antes * 2, 5);
    fireEvent.pointerUp(area, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(area, { pointerId: 2, pointerType: 'touch' });
  });
});
