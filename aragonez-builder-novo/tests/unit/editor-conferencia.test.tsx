import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROTAS } from '@/app/rotas';
import { criarProjeto } from '@/dados/catalogo';
import { novoId, repo, RepositorioMemoria } from '@/dados/repositorio';
import { Layout, type BrandKit, type LayoutEntrada, type Projeto } from '@/dominio/schemas';
import { editor, useEditor } from '@/editor/estado';
import { adicionarSlide } from '@/editor/operacoes';
import { esperarSalvamentos } from '@/editor/salvamento';
import { exportar } from '@/exportar/exportar';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

// a captura não roda no jsdom: a exportação em si é trocada por uma versão que só responde; a conferência de antes
// (conferirExportacao) é a de verdade
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

async function novoProjeto(mudar?: (p: Projeto) => void, layout: Layout = LAYOUT_TESTE, kit = KIT_TESTE) {
  const p = criarProjeto(layout, kit, 'Projeto');
  mudar?.(p);
  await r.salvarProjeto(p);
  return p;
}
function abrir(id: string) {
  render(<RouterProvider router={createMemoryRouter(ROTAS, { initialEntries: [`/editor/${id}`] })} />);
  return screen.findByTestId('editor');
}

describe('conferência antes de exportar', () => {
  it('foto vazia no slide 3: pergunta antes, Enter ao abrir não exporta e o item leva ao campo Foto', async () => {
    const p = await novoProjeto((x) => {
      const [capa, conteudo] = x.slides;
      x.slides = [capa!, conteudo!, { ...capa!, id: 's-3', overrides: { foto: { url: null } } }];
    });
    await abrir(p.id);
    await userEvent.click(screen.getByTestId('exportar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Exportar mesmo assim?' });
    expect(within(dialogo).getByTestId('conferencia')).toHaveTextContent('Foto, slide 3 está vazia');
    // a foto de exemplo do slide 1 entra como lembrete
    expect(within(dialogo).getByTestId('conferencia-lembretes')).toHaveTextContent(
      'Foto, slide 1 ainda é a foto de exemplo do layout',
    );
    // o foco começa em "Voltar e corrigir": Enter fecha sem exportar
    expect(document.activeElement).toHaveTextContent('Voltar e corrigir');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(exportar).not.toHaveBeenCalled();

    // o item leva ao campo: ativa o slide 3, seleciona a camada e foca o campo no painel
    await userEvent.click(screen.getByTestId('exportar'));
    const d2 = await screen.findByRole('dialog');
    await userEvent.click(within(d2).getByRole('button', { name: /Foto, slide 3 está vazia/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useEditor.getState().slideAtivo).toBe(2);
    expect(useEditor.getState().selecao).toEqual({ dono: 2, ids: ['foto'] });
    await waitFor(() => expect(document.activeElement?.id).toBe('campo-2-foto'));
    expect(exportar).not.toHaveBeenCalled();
  });

  it('"Exportar mesmo assim" exporta', async () => {
    const p = await novoProjeto((x) => void (x.slides[0]!.overrides = { foto: { url: null } }));
    await abrir(p.id);
    await userEvent.click(screen.getByTestId('exportar'));
    await userEvent.click(await screen.findByTestId('exportar-mesmo-assim'));
    await waitFor(() => expect(exportar).toHaveBeenCalledTimes(1));
  });

  it('foto de exemplo: projeto novo avisa como lembrete (Exportar focado); depois de trocar a foto, não avisa', async () => {
    const p = await novoProjeto();
    await abrir(p.id);
    await userEvent.click(screen.getByTestId('exportar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Lembrete antes de exportar' });
    expect(dialogo).toHaveTextContent('Foto, slide 1 ainda é a foto de exemplo do layout');
    expect(document.activeElement).toHaveTextContent('Exportar');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Voltar e trocar' }));

    const arq = await r.salvarArquivo(new Blob(['minha foto'], { type: 'image/png' }));
    act(() =>
      editor.editar('Trocar foto', (d) => {
        const foto = d.doc.slides[0]!.camadas.find((c) => c.id === 'foto');
        if (foto?.tipo === 'imagem') {
          foto.assetId = arq;
          delete foto.url;
        }
      }),
    );
    await userEvent.click(screen.getByTestId('exportar'));
    await waitFor(() => expect(exportar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('trocar para um kit sem uma cor usada: o editor avisa e a exportação pergunta antes', async () => {
    const { suave: _suave, ...cores } = KIT_TESTE.cores;
    const semSuave: BrandKit = { ...KIT_TESTE, id: 'kit-sem-suave', nome: 'Sem Suave', cores };
    await r.salvarKit(semSuave);
    const p = await novoProjeto((x) => void (x.slides[0]!.overrides = {}));
    await abrir(p.id);
    expect(screen.queryByTestId('aviso-cores-do-kit')).not.toBeInTheDocument();
    act(() => editor.escolherKit(semSuave));
    const aviso = await screen.findByTestId('aviso-cores-do-kit');
    expect(aviso).toHaveTextContent("O kit Sem Suave não tem a cor 'suave' (aparece em magenta");
    await userEvent.click(screen.getByTestId('exportar'));
    const dialogo = await screen.findByRole('dialog', { name: 'Exportar mesmo assim?' });
    expect(within(dialogo).getByTestId('conferencia')).toHaveTextContent("O kit Sem Suave não tem a cor 'suave'");
    expect(exportar).not.toHaveBeenCalled();
  });
});

describe('fotos carregadas quando o documento muda', () => {
  it('adicionar um slide de um tipo com fundo de foto mostra a foto no canvas e na miniatura', async () => {
    const arq = await r.salvarArquivo(new Blob(['fundo'], { type: 'image/png' }));
    const layout = Layout.parse({
      id: 'l-fundo-foto',
      nome: 'Fundo de foto',
      categoria: 'Teste',
      formato: { w: 1080, h: 1350 },
      status: 'publicado',
      tiposDeSlide: [
        { id: 'liso', nome: 'Liso', fundo: { tipo: 'cor', cor: '#ffffff' }, camadas: [] },
        { id: 'com-foto', nome: 'Com foto', fundo: { tipo: 'imagem', assetId: arq, ajuste: 'cover' }, camadas: [] },
      ],
    } satisfies LayoutEntrada);
    await r.salvarLayout(layout);
    const p = await novoProjeto((x) => void (x.slides = [x.slides[0]!]), layout);
    await abrir(p.id);
    act(() => {
      editor.editar('Adicionar slide', (d) => void adicionarSlide(d.doc, layout, 'com-foto'));
      editor.ativarSlide(1);
    });
    const canvas = screen.getByTestId('canvas');
    await waitFor(() => expect(canvas.querySelector('[data-fundo] img')?.getAttribute('src')).toMatch(/^blob:/));
    const mini = screen.getByRole('button', { name: 'Slide 2: Com foto' });
    expect(mini.querySelector('[data-fundo] img')?.getAttribute('src')).toMatch(/^blob:/);
  });
});

describe('avisos empilhados (140, 155)', () => {
  /** três avisos: erro ao salvar, salvo em outra aba e kit ausente (nessa ordem de urgência) */
  const abrirComTresAvisos = async () => {
    const p = await novoProjeto((x) => void (x.brandKitId = 'kit-que-sumiu'));
    await abrir(p.id);
    await screen.findByTestId('aviso-kit');
    act(() => useEditor.setState({ salvamento: 'erro', erroAoSalvar: 'Disco com problema', alteradoEmOutraAba: true }));
  };
  const visiveis = () =>
    [...document.querySelectorAll('[data-testid^="aviso-"]')]
      .filter((e) => !e.closest('[hidden]'))
      .map((e) => e.getAttribute('data-testid'));

  it('no computador, todos aparecem, do mais urgente para o menos urgente', async () => {
    await abrirComTresAvisos();
    expect(visiveis()).toEqual(['aviso-erro-salvar', 'aviso-outra-aba', 'aviso-kit']);
    expect(screen.queryByTestId('mais-avisos')).not.toBeInTheDocument();
  });

  it('no celular (390 px), só o mais urgente fica aberto; a linha diz quais são os outros e abre e fecha a lista', async () => {
    const original = window.matchMedia;
    // 390 px de largura: só o corte do celular (max-width: 860px) responde que sim
    window.matchMedia = (q: string) =>
      ({
        ...original(q),
        matches: /max-width:\s*(\d+)px/.test(q) && 390 <= Number(/(\d+)px/.exec(q)![1]),
      }) as MediaQueryList;
    try {
      await abrirComTresAvisos();
      expect(visiveis()).toEqual(['aviso-erro-salvar']);
      const mais = screen.getByTestId('mais-avisos');
      expect(mais).toHaveTextContent('+2 avisos: salvo em outra aba, kit ausente');
      expect(mais).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(mais);
      expect(visiveis()).toEqual(['aviso-erro-salvar', 'aviso-outra-aba', 'aviso-kit']);
      expect(mais).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(mais);
      expect(visiveis()).toEqual(['aviso-erro-salvar']);
    } finally {
      window.matchMedia = original;
    }
  });
});
