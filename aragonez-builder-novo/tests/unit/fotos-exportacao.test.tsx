import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arquivoFaltando, garantirArquivos, urlDoArquivo, versaoDosArquivos } from '@/dados/arquivos';
import { criarProjeto } from '@/dados/catalogo';
import { novoId, repo, RepositorioMemoria } from '@/dados/repositorio';
import { montarSlides } from '@/dominio/montagem';
import { Layout, type LayoutEntrada, type Projeto } from '@/dominio/schemas';
import { nosSlides } from '@/editor/conferencia';
import { editor, useEditor } from '@/editor/estado';
import { montadoDo } from '@/editor/useDocumento';
import { conferirExportacao, gerarArquivos } from '@/exportar/exportar';
import { capturar } from '@/exportar/motor';
import { arquivosDosSlides, estatisticasDoKit, problemasDoKit } from '@/exportar/usosDosSlides';
import { ProvedorRender, Slide } from '@/render/Slide';
import { KIT_NEUTRO } from '@/seeds/kits';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

// a captura de verdade (modern-screenshot) não roda no jsdom: o render fora da tela é o real, a captura e o
// arquivo final são trocados por versões mínimas. Cada render guarda quais arquivos já tinham endereço.
const naCaptura: Record<string, string | undefined>[] = [];
let observar: string[] = [];
vi.mock('@/exportar/motor', async (original) => {
  const real = await original<typeof import('@/exportar/motor')>();
  const { urlDoArquivo: url } = await import('@/dados/arquivos');
  return {
    ...real,
    renderizarFora: vi.fn(async (...args: Parameters<typeof real.renderizarFora>) => {
      naCaptura.push(Object.fromEntries(observar.map((id) => [id, url(id)])));
      return real.renderizarFora(...args);
    }),
    capturar: vi.fn(async () => document.createElement('canvas')),
  };
});
vi.mock('@/exportar/arquivos', async (original) => {
  const real = await original<typeof import('@/exportar/arquivos')>();
  return { ...real, canvasParaBlob: vi.fn(async () => new Blob(['x'], { type: 'image/png' })) };
});

/** Memória com os arquivos num Map: no Node, o structuredClone do repositório em memória não preserva o Blob (no
 *  navegador preserva). */
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
  override async excluirArquivos(ids: string[]) {
    ids.forEach((id) => this.blobs.delete(id));
  }
}

const original = repo.atual;
let r: RepoComArquivos;
beforeEach(() => {
  r = new RepoComArquivos();
  repo.atual = r; // troca de banco: limpa os endereços e as faltas do teste anterior
  naCaptura.length = 0;
  observar = [];
});
afterEach(() => {
  repo.atual = original;
  vi.clearAllMocks();
});

const png = (t = 'x') => new Blob([t], { type: 'image/png' });
const projetoDe = (layout: Layout, tipos: string[], mudar?: (p: Projeto) => void) => {
  const p: Projeto = {
    id: 'p1',
    nome: 'Teste',
    layoutId: layout.id,
    brandKitId: KIT_NEUTRO.id,
    formato: layout.formato,
    slides: tipos.map((tipoId, i) => ({ id: `s${i}`, tipoId, conteudo: {}, overrides: {}, camadasExtras: [] })),
    faixaOverrides: {},
    faixaExtras: [],
    versaoSchema: 1,
  };
  mudar?.(p);
  return p;
};

/** Layout com textura no fundo padrão do tipo e um logo (com uma url de outra marca, que nunca pode aparecer). */
function layoutComTexturaELogo(textura: string, logo: string): Layout {
  return Layout.parse({
    id: 'l-textura',
    nome: 'Textura e logo',
    categoria: 'Teste',
    formato: { w: 1080, h: 1350 },
    tiposDeSlide: [
      {
        id: 'capa',
        nome: 'Capa',
        fundo: { tipo: 'imagem', assetId: textura, ajuste: 'cover' },
        camadas: [
          {
            id: 'logo',
            tipo: 'logo',
            x: 40,
            y: 40,
            w: 200,
            h: 80,
            assetId: logo,
            url: '/outra-marca.png',
            rotulo: 'Logo',
          },
        ],
      },
    ],
  } satisfies LayoutEntrada);
}

describe('exportação espera as fotos', () => {
  // o render fora da tela é uma raiz React própria, fora do act() do Testing Library (como na exportação real)
  const ambiente = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let antes: boolean | undefined;
  beforeEach(() => {
    antes = ambiente.IS_REACT_ACT_ENVIRONMENT;
    ambiente.IS_REACT_ACT_ENVIRONMENT = false;
  });
  afterEach(() => {
    ambiente.IS_REACT_ACT_ENVIRONMENT = antes;
  });

  it('textura do fundo padrão do layout e logo: os dois carregados antes da captura', async () => {
    const textura = await r.salvarArquivo(png('textura'));
    const logo = await r.salvarArquivo(png('logo'));
    observar = [textura, logo];
    const layout = layoutComTexturaELogo(textura, logo);
    const res = await gerarArquivos({
      layout,
      kit: KIT_NEUTRO,
      projeto: projetoDe(layout, ['capa', 'capa']),
      formato: 'png',
      separados: true,
      urlDoAsset: urlDoArquivo,
      garantirArquivos,
    });
    expect(naCaptura).toHaveLength(2);
    for (const c of naCaptura) {
      expect(c[textura]).toMatch(/^blob:/);
      expect(c[logo]).toMatch(/^blob:/);
    }
    expect(res.arquivos).toHaveLength(2);
    expect(res.arquivosFaltando).toEqual([]);
  });

  it('arquivo apagado do banco: o aviso nomeia o campo e o slide, e nenhuma outra imagem entra no lugar', async () => {
    const textura = await r.salvarArquivo(png('textura'));
    const logo = await r.salvarArquivo(png('logo'));
    await r.excluirArquivos([logo]);
    const layout = layoutComTexturaELogo(textura, logo);
    const op = {
      layout,
      kit: KIT_NEUTRO,
      projeto: projetoDe(layout, ['capa', 'capa']),
      urlDoAsset: urlDoArquivo,
      garantirArquivos,
    };
    const c = await conferirExportacao(op);
    // a mesma foto nos dois slides: um aviso só, com os slides unidos
    expect(c.faltando).toEqual([{ campo: 'Logo', slides: [0, 1], dono: 0, camadaId: 'logo', assetId: logo }]);
    expect(arquivoFaltando(logo)).toBe(true);

    const res = await gerarArquivos({ ...op, formato: 'png', separados: true });
    // uma falta só, com os slides unidos (item 134)
    expect(res.arquivosFaltando.map((f) => `${f.campo}, ${nosSlides(f.slides)}`)).toEqual(['Logo, slides 1 e 2']);
    // o nó capturado: textura desenhada, logo vazio (sem a url de outra marca) e marcado para a última barreira
    const no = vi.mocked(capturar).mock.calls[0]![0];
    expect(no.querySelector('[data-fundo] img')?.getAttribute('src')).toMatch(/^blob:/);
    expect(no.querySelector('[data-camada="logo"] img')).toBeNull();
    expect(no.querySelector(`[data-camada="logo"] [data-arquivo-faltando="${logo}"]`)).not.toBeNull();
    expect(no.innerHTML).not.toContain('outra-marca');
    expect(no.textContent).not.toMatch(/Logo|não encontrad/);
  });

  it('última barreira: imagem que não carrega na captura entra em arquivosFaltando', async () => {
    const textura = await r.salvarArquivo(png('textura'));
    const blobDoLogo = png('logo estragado');
    const logo = await r.salvarArquivo(blobDoLogo);
    const layout = layoutComTexturaELogo(textura, logo);
    // a conferência passa (os dois existem e têm endereço), mas o arquivo do logo não abre: a imagem dispara 'error'
    const criar = URL.createObjectURL.bind(URL);
    const espia = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((b) => (b === blobDoLogo ? 'blob:quebrado-logo' : criar(b)));
    try {
      const res = await gerarArquivos({
        layout,
        kit: KIT_NEUTRO,
        projeto: projetoDe(layout, ['capa']),
        formato: 'png',
        urlDoAsset: urlDoArquivo,
        garantirArquivos,
      });
      // a textura carregou e não entra; o logo entra com o campo, o slide e o arquivo
      expect(res.arquivosFaltando).toEqual([{ campo: 'Logo', slides: [0], dono: 0, camadaId: 'logo', assetId: logo }]);
    } finally {
      espia.mockRestore();
    }
  });
});

describe('modo do render: editor × exportação', () => {
  const layout = Layout.parse({
    id: 'l-vazio',
    nome: 'Vazio',
    categoria: 'Teste',
    formato: { w: 1080, h: 1350 },
    tiposDeSlide: [
      {
        id: 'capa',
        nome: 'Capa',
        fundo: { tipo: 'cor', cor: '#ffffff' },
        camadas: [{ id: 'foto', tipo: 'imagem', x: 0, y: 0, w: 500, h: 500, editavel: true, rotulo: 'Foto' }],
      },
    ],
  } satisfies LayoutEntrada);
  const desenhar = (
    modo: 'editor' | 'exportacao',
    mudar?: (p: Projeto) => void,
    faltando?: (id: string) => boolean,
  ) => {
    const slide = montarSlides(layout, projetoDe(layout, ['capa'], mudar))[0]!;
    return render(
      <ProvedorRender layout={layout} kit={KIT_NEUTRO} modo={modo} arquivoFaltando={faltando}>
        <Slide slide={slide} w={1080} h={1350} />
      </ProvedorRender>,
    ).container;
  };

  it('o mesmo slide com foto vazia mostra "Imagem" no editor e não mostra na exportação', () => {
    expect(desenhar('editor').textContent).toContain('Imagem');
    expect(desenhar('exportacao').textContent).toBe('');
  });

  it('campo de foto vazio com moldura e sombra: no editor a moldura fica; na exportação, nada (o espaço fica vazio)', () => {
    const comMoldura = Layout.parse({
      ...layout,
      tiposDeSlide: [
        {
          ...layout.tiposDeSlide[0]!,
          camadas: [
            {
              id: 'foto',
              tipo: 'imagem',
              x: 0,
              y: 0,
              w: 500,
              h: 500,
              editavel: true,
              rotulo: 'Foto',
              borda: { cor: '#ff5a1f', largura: 3 },
              sombra: { x: 0, y: 8, desfoque: 20, cor: '#00000080' },
            },
          ],
        },
      ],
    });
    const desenharCom = (modo: 'editor' | 'exportacao') => {
      const slide = montarSlides(comMoldura, projetoDe(comMoldura, ['capa']))[0]!;
      return render(
        <ProvedorRender layout={comMoldura} kit={KIT_NEUTRO} modo={modo}>
          <Slide slide={slide} w={1080} h={1350} />
        </ProvedorRender>,
      ).container.querySelector<HTMLElement>('[data-camada="foto"]')!;
    };
    const editor = desenharCom('editor');
    expect(editor.style.boxShadow).not.toBe('');
    expect(editor.innerHTML).toContain('inset');
    const exportado = desenharCom('exportacao');
    expect(exportado.style.boxShadow).toBe('');
    expect(exportado.innerHTML).toBe('');
  });

  it('foto que não existe: marcador "Foto não encontrada" só no editor', () => {
    const comFoto = (p: Projeto) => void (p.slides[0]!.conteudo.foto = { assetId: 'arq-sumiu' });
    expect(desenhar('editor', comFoto, () => true).textContent).toBe('Foto não encontrada');
    // carregando (ainda não se sabe): listras sem texto
    expect(desenhar('editor', comFoto, () => false).textContent).toBe('');
    const exp = desenhar('exportacao', comFoto, () => true);
    expect(exp.textContent).toBe('');
    expect(exp.querySelector('[data-arquivo-faltando="arq-sumiu"]')).not.toBeNull();
  });
});

describe('arquivosDosSlides', () => {
  it('pega camadas, grupos, componentes, fundo do tipo, faixa e fundo da faixa, com campo e slide', () => {
    const layout = Layout.parse({
      id: 'l-tudo',
      nome: 'Tudo',
      categoria: 'Teste',
      formato: { w: 1000, h: 1000 },
      continuo: true,
      faixa: {
        fundo: { tipo: 'imagem', assetId: 'a-faixa', ajuste: 'cover' },
        camadas: [{ id: 'ponte', tipo: 'imagem', x: 800, y: 0, w: 400, h: 300, assetId: 'a-ponte', rotulo: 'Ponte' }],
      },
      componentes: [
        {
          id: 'cab',
          nome: 'Header',
          w: 300,
          h: 100,
          camadas: [{ id: 'av', tipo: 'imagem', x: 0, y: 0, w: 100, h: 100, assetId: 'a-avatar', rotulo: 'Avatar' }],
        },
      ],
      tiposDeSlide: [
        {
          id: 'capa',
          nome: 'Capa',
          fundo: { tipo: 'imagem', assetId: 'a-fundo', ajuste: 'cover' },
          camadas: [
            { id: 'h', tipo: 'componente', x: 0, y: 0, w: 300, h: 100, componenteId: 'cab' },
            {
              id: 'g',
              tipo: 'grupo',
              x: 0,
              y: 0,
              w: 500,
              h: 500,
              filhos: [{ id: 'foto', tipo: 'imagem', x: 0, y: 0, w: 500, h: 500, editavel: true, rotulo: 'Foto' }],
            },
            { id: 'ex', tipo: 'imagem', x: 0, y: 0, w: 10, h: 10, editavel: true, url: '/exemplo.png' },
            { id: 'oculta', tipo: 'imagem', x: 0, y: 0, w: 10, h: 10, assetId: 'a-oculta', oculta: true },
          ],
        },
      ],
    } satisfies LayoutEntrada);
    const projeto = projetoDe(layout, ['capa', 'capa'], (p) => {
      p.slides[1]!.conteudo.foto = { assetId: 'a-foto' };
    });
    const { arquivos, vazias, deExemplo } = arquivosDosSlides(
      layout,
      montarSlides(layout, projeto),
      KIT_NEUTRO,
      projeto,
    );
    const resumo = arquivos.map((a) => `${a.assetId} ${a.campo} [${a.slides}] ${a.dono} ${a.camadaId ?? '-'}`);
    expect(resumo).toEqual([
      'a-fundo Fundo [0] 0 -',
      'a-avatar Avatar [0] 0 h',
      'a-fundo Fundo [1] 1 -',
      'a-avatar Avatar [1] 1 h',
      'a-foto Foto [1] 1 foto',
      'a-ponte Ponte [0,1] faixa ponte',
      'a-faixa Fundo da faixa [] faixa -',
    ]);
    expect(vazias).toEqual([{ campo: 'Foto', slides: [0], dono: 0, camadaId: 'foto' }]);
    expect(deExemplo.map((e) => `${e.campo} [${e.slides}]`)).toEqual(['Imagem [0]', 'Imagem [1]']);
  });
});

describe('problemasDoKit', () => {
  it('cores que o kit não tem (com os slides) e {handle} sem handle', () => {
    const layout = Layout.parse({
      id: 'l-cores',
      nome: 'Cores',
      categoria: 'Teste',
      formato: { w: 1080, h: 1350 },
      tiposDeSlide: [
        { id: 'a', nome: 'A', fundo: { tipo: 'cor', cor: '{cores.fundo}' }, camadas: [] },
        {
          id: 'b',
          nome: 'B',
          fundo: { tipo: 'cor', cor: '{cores.fundo}' },
          camadas: [
            {
              id: 't',
              tipo: 'texto',
              x: 0,
              y: 0,
              w: 500,
              h: 100,
              texto: 'Siga {handle}',
              cor: '{cores.texto}',
              destaque: { cor: '{cores.destaque}' },
            },
            {
              id: 'f',
              tipo: 'forma',
              forma: 'retangulo',
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              preenchimento: '{cores.destaque}/40',
            },
          ],
        },
      ],
    } satisfies LayoutEntrada);
    const projeto = projetoDe(layout, ['a', 'b', 'a', 'b']);
    const p = problemasDoKit(layout, montarSlides(layout, projeto), { ...KIT_NEUTRO, handle: undefined }, projeto);
    expect(p).toEqual({ cores: [{ cor: 'destaque', slides: [1, 3] }], handle: [1, 3] });
    expect(
      problemasDoKit(layout, montarSlides(layout, projeto), { ...KIT_NEUTRO, handle: '@marca' }, projeto).handle,
    ).toBe(null);
  });
});

describe('garantirArquivos', () => {
  it('trocar o repositório no meio de uma leitura não deixa a url', async () => {
    let liberar: (b: Blob) => void = () => {};
    vi.spyOn(r, 'lerArquivo').mockImplementation(() => new Promise((ok) => (liberar = ok)));
    const pedido = garantirArquivos(['arq-1']);
    repo.atual = new RepositorioMemoria();
    liberar(png());
    expect(await pedido).toEqual(['arq-1']);
    expect(urlDoArquivo('arq-1')).toBeUndefined();
    expect(arquivoFaltando('arq-1')).toBe(false);
  });

  it('um arquivo que já falta não muda a versão (nem redesenha) a cada procura', async () => {
    expect(await garantirArquivos(['arq-sumiu'])).toEqual(['arq-sumiu']);
    const v = versaoDosArquivos();
    expect(await garantirArquivos(['arq-sumiu'])).toEqual(['arq-sumiu']);
    expect(await garantirArquivos(['arq-sumiu'])).toEqual(['arq-sumiu']);
    expect(versaoDosArquivos()).toBe(v);
  });

  it('20 arquivos numa chamada mudam a versão uma vez só', async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, (_, i) => r.salvarArquivo(png(String(i)))));
    const v = versaoDosArquivos();
    expect(await garantirArquivos(ids)).toEqual([]);
    expect(versaoDosArquivos()).toBe(v + 1);
    // já carregados: nada muda
    expect(await garantirArquivos(ids)).toEqual([]);
    expect(versaoDosArquivos()).toBe(v + 1);
  });
});

describe('faltas da exportação: uma por arquivo e campo', () => {
  const ambiente = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let antes: boolean | undefined;
  beforeEach(() => {
    antes = ambiente.IS_REACT_ACT_ENVIRONMENT;
    ambiente.IS_REACT_ACT_ENVIRONMENT = false;
  });
  afterEach(() => {
    ambiente.IS_REACT_ACT_ENVIRONMENT = antes;
  });

  it('foto da faixa apagada no contínuo de 3 slides: um aviso só, com os slides que ela cruza', async () => {
    const ponte = await r.salvarArquivo(png('ponte'));
    await r.excluirArquivos([ponte]);
    const layout = Layout.parse({
      id: 'l-continuo',
      nome: 'Contínuo',
      categoria: 'Teste',
      formato: { w: 1000, h: 1000 },
      continuo: true,
      faixa: {
        camadas: [
          { id: 'ponte', tipo: 'imagem', x: 600, y: 0, w: 1000, h: 300, assetId: ponte, rotulo: 'Foto da ponte' },
        ],
      },
      tiposDeSlide: [{ id: 's', nome: 'Slide', fundo: { tipo: 'transparente' }, camadas: [] }],
    } satisfies LayoutEntrada);
    const res = await gerarArquivos({
      layout,
      kit: KIT_NEUTRO,
      projeto: projetoDe(layout, ['s', 's', 's']),
      formato: 'png',
      separados: true,
      urlDoAsset: urlDoArquivo,
      garantirArquivos,
    });
    expect(res.arquivos).toHaveLength(3);
    // x de 600 a 1600: cruza os slides 1 e 2 (índices 0 e 1)
    expect(res.arquivosFaltando).toEqual([
      { campo: 'Foto da ponte', slides: [0, 1], dono: 'faixa', camadaId: 'ponte', assetId: ponte },
    ]);
  });

  it('arquivo apagado e exportação direto pelo gerarArquivos (sem conferir antes): o resultado traz o campo', async () => {
    const textura = await r.salvarArquivo(png('textura'));
    const logo = await r.salvarArquivo(png('logo'));
    await r.excluirArquivos([logo]);
    const layout = layoutComTexturaELogo(textura, logo);
    const res = await gerarArquivos({
      layout,
      kit: KIT_NEUTRO,
      projeto: projetoDe(layout, ['capa']),
      formato: 'png',
      urlDoAsset: urlDoArquivo,
      garantirArquivos,
    });
    expect(res.arquivosFaltando).toEqual([{ campo: 'Logo', slides: [0], dono: 0, camadaId: 'logo', assetId: logo }]);
  });

  it('preparação velha (o arquivo sumiu depois da conferência): a marca data-arquivo-faltando avisa na captura', async () => {
    const textura = await r.salvarArquivo(png('textura'));
    const logo = await r.salvarArquivo(png('logo'));
    const layout = layoutComTexturaELogo(textura, logo);
    const op = {
      layout,
      kit: KIT_NEUTRO,
      projeto: projetoDe(layout, ['capa']),
      urlDoAsset: urlDoArquivo,
      garantirArquivos,
    };
    const c = await conferirExportacao(op);
    expect(c.faltando).toEqual([]);
    // depois da conferência, o banco é trocado (os endereços somem): a conferência não sabe, a captura sabe
    repo.atual = new RepoComArquivos();
    const res = await gerarArquivos({ ...op, formato: 'png' }, c.preparado);
    expect(res.arquivosFaltando.map((f) => `${f.campo} [${f.slides}]`).sort()).toEqual(['Fundo [0]', 'Logo [0]']);
    const no = vi.mocked(capturar).mock.calls[0]![0];
    expect(no.querySelectorAll('[data-arquivo-faltando]')).toHaveLength(2);
  });
});

describe('problemasDoKit no editor: só a camada editada é olhada de novo', () => {
  it('20 slides, 50 letras digitadas: cada letra refaz uma camada só', async () => {
    const p = criarProjeto(LAYOUT_TESTE, KIT_TESTE, 'Vinte');
    p.slides = Array.from({ length: 20 }, (_, i) => ({ ...p.slides[i % 3]!, id: `s${i}` }));
    editor.carregar({ projeto: p, layout: LAYOUT_TESTE, kit: KIT_TESTE, versao: 'v1' });
    const conferir = () => {
      const { doc, layout } = useEditor.getState();
      const efetivo = { ...layout!, faixa: { ...layout!.faixa, camadas: doc.faixa } };
      return problemasDoKit(
        efetivo,
        doc.slides.map((s, i) => montadoDo(layout!, s, i)),
        KIT_TESTE,
      );
    };
    expect(conferir()).toEqual({ cores: [], handle: null });
    const titulo = LAYOUT_TESTE.tiposDeSlide[0]!.camadas.find((c) => c.id === 'titulo')!;
    for (let k = 0; k < 50; k++) {
      editor.editar(
        'Editar texto',
        (d) => {
          const c = d.doc.slides[3]!.camadas.find((x) => x.id === titulo.id);
          if (c?.tipo === 'texto') c.texto += 'a';
        },
        'texto:3:titulo',
      );
      const antes = estatisticasDoKit().olhadas;
      conferir();
      expect(estatisticasDoKit().olhadas - antes).toBe(1);
    }
    editor.fechar();
  });
});

describe('exportar com o preparado da conferência', () => {
  const ambiente = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let antes: boolean | undefined;
  beforeEach(() => {
    antes = ambiente.IS_REACT_ACT_ENVIRONMENT;
    ambiente.IS_REACT_ACT_ENVIRONMENT = false;
  });
  afterEach(() => {
    ambiente.IS_REACT_ACT_ENVIRONMENT = antes;
  });
  const layout = Layout.parse({
    id: 'l-texto',
    nome: 'Texto',
    categoria: 'Teste',
    formato: { w: 1080, h: 1350 },
    tiposDeSlide: [
      {
        id: 'capa',
        nome: 'Capa',
        fundo: { tipo: 'cor', cor: '#ffffff' },
        camadas: [{ id: 'titulo', tipo: 'texto', x: 0, y: 0, w: 900, h: 200, texto: 'Exemplo', editavel: true }],
      },
    ],
  } satisfies LayoutEntrada);
  const comTitulo = (t: string) => projetoDe(layout, ['capa'], (p) => void (p.slides[0]!.conteudo.titulo = t));

  it('conferir, editar um texto e exportar com o preparado antigo: o arquivo sai com o texto novo', async () => {
    const op = { layout, kit: KIT_NEUTRO, urlDoAsset: urlDoArquivo, garantirArquivos };
    const c = await conferirExportacao({ ...op, projeto: comTitulo('Texto antigo') });
    await gerarArquivos({ ...op, projeto: comTitulo('Texto novo'), formato: 'png' }, c.preparado);
    const no = vi.mocked(capturar).mock.calls[0]![0];
    expect(no.textContent).toContain('Texto novo');
    expect(no.textContent).not.toContain('Texto antigo');
  });

  it('conferir e exportar sem mudar nada reaproveita o preparado (garantirArquivos não é chamado de novo)', async () => {
    const op = { layout, kit: KIT_NEUTRO, projeto: comTitulo('Igual'), urlDoAsset: urlDoArquivo };
    const garantir = vi.fn(garantirArquivos);
    // os slides pedidos chegam num array novo a cada chamada: valem pelo conteúdo, não pela referência
    const c = await conferirExportacao({ ...op, indices: [0], garantirArquivos: garantir });
    expect(garantir).toHaveBeenCalledTimes(1);
    await gerarArquivos({ ...op, indices: [0], garantirArquivos: garantir, formato: 'png' }, c.preparado);
    expect(garantir).toHaveBeenCalledTimes(1);
    expect(vi.mocked(capturar).mock.calls[0]![0].textContent).toContain('Igual');
  });
});
