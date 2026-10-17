import { describe, expect, it } from 'vitest';
import { ajustarTamanho } from '@/dominio/autoajuste';
import { aplicarOverrides, avisosDeComponente, cicloDeComponentes, expandirComponente } from '@/dominio/componentes';
import { parseDestaque, semDestaque } from '@/dominio/destaque';
import {
  caminhoLinhaDeLuz,
  extensaoHorizontal,
  fatias,
  larguraFaixa,
  posicaoNaFaixa,
  slidesVisiveis,
} from '@/dominio/faixa';
import { aplicarConteudo, camadasDaFaixa, camposEditaveis, montarSlide, montarSlides } from '@/dominio/montagem';
import { BrandKit, Camada, Layout, validar, type CamadaTexto } from '@/dominio/schemas';
import {
  COR_FALTANDO,
  comOpacidade,
  resolverCor,
  resolverFonte,
  resolverPreenchimento,
  resolverTexto,
} from '@/dominio/tokens';
import { fontesDosSlides } from '@/exportar/usosDosSlides';
import { nomeDoSlide, slug } from '@/exportar/nomes';
import { KIT_TESTE, LAYOUT_TESTE, projetoTeste } from '@/seeds/teste';

const texto = (extra: Partial<CamadaTexto> = {}): CamadaTexto => ({
  id: 't',
  tipo: 'texto',
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  texto: 'Olá',
  ...extra,
});

describe('schemas (Zod)', () => {
  it('aceita o layout de teste e o kit de teste', () => {
    expect(validar(Layout, LAYOUT_TESTE).ok).toBe(true);
    expect(validar(BrandKit, KIT_TESTE).ok).toBe(true);
  });
  it('recusa cor inválida com mensagem em português', () => {
    const r = validar(Camada, texto({ cor: 'laranja' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/Cor inválida/);
  });
  it('aceita token com opacidade e camadas aninhadas em grupo', () => {
    const grupo = { id: 'g', tipo: 'grupo', x: 0, y: 0, w: 10, h: 10, filhos: [texto({ cor: '{cores.primaria}/40' })] };
    expect(validar(Camada, grupo).ok).toBe(true);
  });
  it('recusa layout sem tipos de slide, tipos repetidos e faixa em layout não contínuo', () => {
    const base = { id: 'l', nome: 'L', categoria: 'c', formato: { w: 1080, h: 1350 } };
    expect(validar(Layout, { ...base, tiposDeSlide: [] }).ok).toBe(false);
    const tipo = { id: 'a', nome: 'A', fundo: { tipo: 'cor', cor: '#000000' }, camadas: [] };
    const r = validar(Layout, { ...base, tiposDeSlide: [tipo, tipo] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/repetido/);
    expect(validar(Layout, { ...base, tiposDeSlide: [tipo], faixa: { camadas: [] } }).ok).toBe(false);
  });
});

describe('tokens do Brand Kit', () => {
  it('resolve cores, opacidade e cor faltando', () => {
    expect(resolverCor('{cores.primaria}', KIT_TESTE)).toBe('#FF5A1F');
    expect(resolverCor('{cores.primaria}/40', KIT_TESTE)).toBe('#FF5A1F66');
    expect(resolverCor('#123456', KIT_TESTE)).toBe('#123456');
    expect(resolverCor('{cores.naoexiste}', KIT_TESTE)).toBe(COR_FALTANDO);
    expect(comOpacidade('#fff', 0.5)).toBe('#ffffff80');
    expect(comOpacidade('#00000080', 0.5)).toBe('#00000040');
  });
  it('resolve fontes (destaque cai para o corpo quando o kit não tem)', () => {
    expect(resolverFonte('{fontes.titulo}', KIT_TESTE)).toEqual({
      familia: 'Space Grotesk',
      peso: 300,
      italico: undefined,
    });
    expect(
      resolverFonte('{fontes.destaque}', {
        ...KIT_TESTE,
        fontes: { titulo: KIT_TESTE.fontes.titulo, corpo: KIT_TESTE.fontes.corpo },
      }).familia,
    ).toBe('Space Grotesk');
    expect(resolverFonte('Montserrat', KIT_TESTE)).toEqual({ familia: 'Montserrat' });
  });
  it('troca {handle} e {nome} e monta gradientes', () => {
    expect(resolverTexto('Siga {handle} · {nome}', KIT_TESTE)).toBe('Siga @victoraragonez.dsg · Victor Aragonez');
    expect(
      resolverPreenchimento(
        {
          tipo: 'gradiente',
          angulo: 90,
          paradas: [
            { cor: '{cores.primaria}', pos: 0 },
            { cor: '#000000', pos: 1 },
          ],
        },
        KIT_TESTE,
      ),
    ).toBe('linear-gradient(90deg, #FF5A1F 0%, #000000 100%)');
  });
  it('trocar o kit re-veste a mesma camada', () => {
    const outro = { ...KIT_TESTE, cores: { ...KIT_TESTE.cores, primaria: '#7CC04A' } };
    expect(resolverCor('{cores.primaria}', outro)).toBe('#7CC04A');
  });
});

describe('destaque inline (*palavra*)', () => {
  it('separa trechos normais e destacados', () => {
    expect(parseDestaque('Prompt bonito não paga *boleto.*')).toEqual([
      { texto: 'Prompt bonito não paga ', destaque: false },
      { texto: 'boleto.', destaque: true },
    ]);
  });
  it('vários destaques, asterisco solto e escape', () => {
    expect(parseDestaque('*A* e *B*')).toEqual([
      { texto: 'A', destaque: true },
      { texto: ' e ', destaque: false },
      { texto: 'B', destaque: true },
    ]);
    expect(parseDestaque('5 * 3 = 15')).toEqual([{ texto: '5 * 3 = 15', destaque: false }]);
    expect(parseDestaque('preço \\*promo\\*')).toEqual([{ texto: 'preço *promo*', destaque: false }]);
    expect(semDestaque('Todo dia *uma IA* nova')).toBe('Todo dia uma IA nova');
  });
  it('não destaca asterisco colado em letra ou número nem atravessa quebra de linha', () => {
    const nada = (t: string) => expect(parseDestaque(t)).toEqual([{ texto: t, destaque: false }]);
    nada('R$ 9,99* nas lojas participantes. *Válido até 20/10');
    nada('De R$ 12,99 por R$ 9,99*\n*Válido até 20/10');
    nada('5*5*5');
    nada('Rua das Flores, 12*');
    // espaço logo depois do * de abertura ou logo antes do de fechamento, e fechamento colado em letra
    nada('2 * 3 * 4');
    nada('Frete grátis * consulte regras *');
    nada('Leve 3 * pague 2 * só hoje');
    nada('*promo*ção');
    nada('* a*');
    nada('*a *');
    // o destaque normal continua valendo no começo, depois de espaço, pontuação ou quebra de linha
    expect(parseDestaque('Oferta: *imperdível*\n*Só hoje*')).toEqual([
      { texto: 'Oferta: ', destaque: false },
      { texto: 'imperdível', destaque: true },
      { texto: '\n', destaque: false },
      { texto: 'Só hoje', destaque: true },
    ]);
    expect(parseDestaque('(*grátis*) e Ação*x* *válido*')).toEqual([
      { texto: '(', destaque: false },
      { texto: 'grátis', destaque: true },
      { texto: ') e Ação*x* ', destaque: false },
      { texto: 'válido', destaque: true },
    ]);
  });
});

describe('auto-ajuste do texto', () => {
  it('acha o maior tamanho que cabe', () => {
    expect(ajustarTamanho({ max: 120, min: 12, cabe: (t) => t <= 73.5 })).toBe(73.5);
    expect(ajustarTamanho({ max: 120, min: 12, cabe: () => true })).toBe(120);
    expect(ajustarTamanho({ max: 120, min: 12, cabe: () => false })).toBe(12);
  });
});

describe('carrossel contínuo', () => {
  it('fatias exatas, contíguas e sem sobra (inclusive em escala quebrada)', () => {
    for (const escala of [1, 2, 0.37, 1.5]) {
      const f = fatias(8, 1080, 1350, escala);
      expect(f[0]!.sx).toBe(0);
      for (let i = 1; i < f.length; i++) expect(f[i]!.sx).toBe(f[i - 1]!.sx + f[i - 1]!.sw);
      expect(f.at(-1)!.sx + f.at(-1)!.sw).toBe(Math.round(larguraFaixa(8, 1080) * escala));
      f.forEach((x) => expect(Number.isInteger(x.sx) && Number.isInteger(x.sw)).toBe(true));
    }
    expect(fatias(3, 1080, 1350, 2).map((x) => [x.sx, x.sw, x.sh])).toEqual([
      [0, 2160, 2700],
      [2160, 2160, 2700],
      [4320, 2160, 2700],
    ]);
  });
  it('âncoras e estica posicionam camadas de faixa para N slides', () => {
    const c = texto({ x: 50, w: 200 });
    expect(posicaoNaFaixa({ ...c, ancora: { slide: 'ultimo' } }, 5, 1080).x).toBe(4 * 1080 + 50);
    expect(posicaoNaFaixa({ ...c, ancora: { slide: 9 } }, 3, 1080).x).toBe(2 * 1080 + 50);
    expect(posicaoNaFaixa({ ...c, estica: true }, 4, 1080)).toMatchObject({ x: 0, w: 4320 });
  });
  it('linha de luz: determinística e dentro da faixa para qualquer N', () => {
    const a = caminhoLinhaDeLuz(8, 1080, 1350, { semente: 3 });
    expect(caminhoLinhaDeLuz(8, 1080, 1350, { semente: 3 })).toBe(a);
    for (const n of [2, 5, 20]) {
      const nums = caminhoLinhaDeLuz(n, 1080, 1350)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(n * 1080);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    }
  });
  it('extensão horizontal considera rotação, sombra e grupos', () => {
    expect(extensaoHorizontal(texto({ x: 100, w: 100 }))).toEqual([92, 208]);
    const [a, b] = extensaoHorizontal({ ...texto({ x: 0, w: 100, h: 100 }), rotacao: 45 });
    expect(b - a).toBeCloseTo(Math.SQRT2 * 100 + 16, 5);
    expect(extensaoHorizontal(texto({ x: 0, w: 10, sombra: { x: 20, y: 0, desfoque: 30, cor: '#000000' } }))[1]).toBe(
      10 + 8 + 50,
    );
    const grupo: Camada = { id: 'g', tipo: 'grupo', x: 1000, y: 0, w: 50, h: 50, filhos: [texto({ x: 0, w: 400 })] };
    expect(extensaoHorizontal(grupo)[1]).toBe(1000 + 400 + 8);
  });
  it('slides visíveis numa janela: vizinho que invade entra; elemento longo traz slides distantes', () => {
    const vazio: Camada[] = [];
    const invadeProximo = [texto({ x: 1000, w: 200 })]; // slide 0 invade o 1
    expect(slidesVisiveis([vazio, vazio, vazio], 1, 1080)).toEqual([1]);
    expect(slidesVisiveis([invadeProximo, vazio, vazio], 1, 1080)).toEqual([0, 1]);
    const atravessaDois = [texto({ x: 900, w: 1500 })]; // slide 0 chega até o 2
    expect(slidesVisiveis([atravessaDois, vazio, vazio], 2, 1080)).toEqual([0, 2]);
    expect(slidesVisiveis([vazio, vazio, [texto({ x: -300, w: 200 })]], 1, 1080)).toEqual([1, 2]);
  });
});

describe('componentes e montagem', () => {
  it('expande componente com escala uniforme (a menor), centralizado, e com overrides', () => {
    const exp = expandirComponente(
      {
        id: 'h',
        tipo: 'componente',
        componenteId: 'header',
        x: 0,
        y: 0,
        w: 467.25,
        h: 100,
        overrides: { nome: { cor: '#FFFFFF' } },
      },
      LAYOUT_TESTE.componentes,
    )!;
    const e = Math.min(467.25 / 299, 100 / 64);
    expect(exp.escalaX).toBeCloseTo(e, 9);
    expect(exp.escalaY).toBeCloseTo(e, 9);
    expect(exp.deslocX).toBeCloseTo((467.25 - 299 * e) / 2, 9);
    expect(exp.deslocY).toBeCloseTo(0, 9);
    // caixa bem mais larga: sobra espaço dos lados e o componente fica no meio, sem deformar
    const largo = expandirComponente(
      { id: 'h2', tipo: 'componente', componenteId: 'header', x: 0, y: 0, w: 900, h: 64 },
      LAYOUT_TESTE.componentes,
    )!;
    expect([largo.escalaX, largo.escalaY, largo.deslocX, largo.deslocY]).toEqual([1, 1, (900 - 299) / 2, 0]);
    expect(exp.camadas.find((c) => c.id === 'nome')).toMatchObject({ cor: '#FFFFFF' });
    expect(
      expandirComponente({ id: 'x', tipo: 'componente', componenteId: 'nao-existe', x: 0, y: 0, w: 1, h: 1 }, []),
    ).toBeNull();
  });
  it('esticar: true usa a escala de cada eixo, sem deslocamento', () => {
    const exp = expandirComponente(
      { id: 'h', tipo: 'componente', componenteId: 'header', x: 0, y: 0, w: 900, h: 64, esticar: true },
      LAYOUT_TESTE.componentes,
    )!;
    expect([exp.escalaX, exp.escalaY, exp.deslocX, exp.deslocY]).toEqual([900 / 299, 1, 0, 0]);
  });
  it('precedência: ajuste do projeto > conteúdo > layout', () => {
    const s = montarSlide(LAYOUT_TESTE, {
      tipoId: 'capa',
      conteudo: { titulo: 'Novo *título*' },
      overrides: { etiqueta: { texto: 'Mudou' }, titulo: { texto: 'Override vence' } },
    });
    expect((s.camadas.find((c) => c.id === 'titulo') as CamadaTexto).texto).toBe('Override vence');
    expect((s.camadas.find((c) => c.id === 'etiqueta') as CamadaTexto).texto).toBe('Mudou');
    const so = montarSlide(LAYOUT_TESTE, { tipoId: 'capa', conteudo: { titulo: 'Novo' }, overrides: {} });
    expect((so.camadas.find((c) => c.id === 'titulo') as CamadaTexto).texto).toBe('Novo');
  });
  it('conteúdo de imagem e overrides dentro de grupos', () => {
    const img = aplicarConteudo({ id: 'i', tipo: 'imagem', x: 0, y: 0, w: 1, h: 1 }, { url: 'a.png', zoom: 2 });
    expect(img).toMatchObject({ url: 'a.png', zoom: 2 });
    const g: Camada[] = [{ id: 'g', tipo: 'grupo', x: 0, y: 0, w: 1, h: 1, filhos: [texto()] }];
    expect(
      ((aplicarOverrides(g, { t: { texto: 'x' } })[0] as Extract<Camada, { tipo: 'grupo' }>).filhos[0] as CamadaTexto)
        .texto,
    ).toBe('x');
  });
  it('monta N slides do projeto e as camadas da faixa esticam para N', () => {
    const p = projetoTeste(5);
    expect(montarSlides(LAYOUT_TESTE, p).map((s) => s.tipo.id)).toEqual([
      'capa',
      'conteudo',
      'conteudo',
      'conteudo',
      'cta',
    ]);
    expect(camadasDaFaixa(LAYOUT_TESTE, 5)[0]).toMatchObject({ x: 0, w: 5 * 1080 });
    expect(camposEditaveis(LAYOUT_TESTE.tiposDeSlide[0]!).map((c) => c.id)).toEqual([
      'foto',
      'etiqueta',
      'titulo',
      'subtitulo',
    ]);
  });
});

describe('nomes de arquivo', () => {
  it('{projeto}-{NN}-{tipo}.ext sem acentos', () => {
    expect(slug('Prompt Bonito: Não Paga Boleto!')).toBe('prompt-bonito-nao-paga-boleto');
    expect(nomeDoSlide('Receitas Feira Nova', 2, 'Passo a passo', 'jpg')).toBe(
      'receitas-feira-nova-03-passo-a-passo.jpg',
    );
    expect(slug('***')).toBe('arquivo');
  });
});

describe('componente dentro de si mesmo (A → B → A)', () => {
  const A = {
    id: 'a',
    nome: 'A',
    w: 100,
    h: 100,
    camadas: [{ id: 'usa-b', tipo: 'componente', componenteId: 'b', x: 0, y: 0, w: 100, h: 100 } as Camada],
  };
  const B = {
    id: 'b',
    nome: 'B',
    w: 100,
    h: 100,
    camadas: [
      { id: 'usa-a', tipo: 'componente', componenteId: 'a', x: 0, y: 0, w: 100, h: 100 } as Camada,
      texto({ id: 'txt', fonte: 'Montserrat' }),
    ],
  };
  const instA = { id: 'i', tipo: 'componente' as const, componenteId: 'a', x: 0, y: 0, w: 100, h: 100 };

  it('expandirComponente para e avisa quando o componente já está aberto', () => {
    const avisos: string[] = [];
    const original = avisosDeComponente.avisar;
    avisosDeComponente.avisar = (m) => avisos.push(m);
    try {
      const a = expandirComponente(instA, [A, B])!;
      expect(a.visitados).toEqual(['a']);
      const b = expandirComponente(a.camadas[0] as Extract<Camada, { tipo: 'componente' }>, [A, B], a.visitados)!;
      expect(b.visitados).toEqual(['a', 'b']);
      expect(
        expandirComponente(b.camadas[0] as Extract<Camada, { tipo: 'componente' }>, [A, B], b.visitados),
      ).toBeNull();
      expect(avisos).toEqual(['Componente "a" contém a si mesmo (a → b → a); parei de desenhar aqui.']);
    } finally {
      avisosDeComponente.avisar = original;
    }
  });

  it('o schema do layout recusa o ciclo e diz qual é', () => {
    expect(cicloDeComponentes([A, B])).toEqual(['a', 'b', 'a']);
    expect(cicloDeComponentes(LAYOUT_TESTE.componentes)).toBeNull();
    const r = validar(Layout, { ...LAYOUT_TESTE, componentes: [A, B] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.join(' ')).toMatch(/Componente contém a si mesmo: a → b → a/);
  });

  it('fontesDosSlides termina e acha a fonte de dentro do componente', () => {
    const original = avisosDeComponente.avisar;
    avisosDeComponente.avisar = () => {};
    try {
      // monta à mão (o schema recusaria): um slide que usa o componente A
      const layout = { ...LAYOUT_TESTE, componentes: [A, B] } as typeof LAYOUT_TESTE;
      const slide = {
        indice: 0,
        tipo: LAYOUT_TESTE.tiposDeSlide[0]!,
        fundo: { tipo: 'transparente' as const },
        camadas: [instA as Camada],
      };
      const usos = fontesDosSlides(layout, [slide], KIT_TESTE);
      expect(usos.some((u) => u.familia === 'Montserrat')).toBe(true);
    } finally {
      avisosDeComponente.avisar = original;
    }
  });
});
