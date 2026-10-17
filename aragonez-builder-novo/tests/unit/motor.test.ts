import { describe, expect, it } from 'vitest';
import { amostrarCaminho, lerCaminho, pontosDensos, pontosDoCaminho } from '@/dominio/caminhoSvg';
import { aplicarOverrides } from '@/dominio/componentes';
import {
  caminhoLinhaDeLuz,
  caminhoPorPontos,
  pontoNaFaixaParaSlide,
  pontosDaLinha,
  pontosDaSemente,
  pontosNaFaixa,
} from '@/dominio/faixa';
import { camadasDaFaixa, faixaDoProjeto, layoutComFaixa, montarSlide, montarSlides } from '@/dominio/montagem';
import { Projeto, SlideDoProjeto, type Camada, type CamadaTexto } from '@/dominio/schemas';
import { resolverTexto } from '@/dominio/tokens';
import { vetorDoGradiente } from '@/render/gradiente';
import { chaveDaMedida } from '@/render/medida';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const texto = (id: string, extra: Partial<CamadaTexto> = {}): CamadaTexto => ({
  id,
  tipo: 'texto',
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  texto: id,
  ...extra,
});
const ids = (cs: Camada[]) => cs.map((c) => c.id);

describe('camadas extras do slide (Modo Design no projeto)', () => {
  it('o schema aceita e completa camadasExtras', () => {
    const s = SlideDoProjeto.parse({ id: 's1', tipoId: 'capa' });
    expect(s.camadasExtras).toEqual([]);
    const com = SlideDoProjeto.parse({ id: 's1', tipoId: 'capa', camadasExtras: [texto('selo')] });
    expect(com.camadasExtras[0]).toMatchObject({ id: 'selo', tipo: 'texto' });
    expect(() =>
      SlideDoProjeto.parse({ id: 's1', tipoId: 'capa', camadasExtras: [{ id: 'x', tipo: 'nada' }] }),
    ).toThrow();
  });
  it('montarSlide junta as extras depois das camadas do layout, sem mexer no layout', () => {
    const antes = JSON.stringify(LAYOUT_TESTE);
    const s = montarSlide(LAYOUT_TESTE, {
      tipoId: 'capa',
      conteudo: {},
      overrides: {},
      camadasExtras: [texto('selo', { texto: 'NOVO' }), texto('nota')],
    });
    const doTipo = ids(LAYOUT_TESTE.tiposDeSlide[0]!.camadas);
    expect(ids(s.camadas)).toEqual([...doTipo, 'selo', 'nota']);
    expect(JSON.stringify(LAYOUT_TESTE)).toBe(antes);
    // as extras de um slide não aparecem nos outros slides do mesmo tipo
    const outro = montarSlide(LAYOUT_TESTE, { tipoId: 'capa', conteudo: {}, overrides: {} });
    expect(ids(outro.camadas)).toEqual(doTipo);
  });
  it('ordem reposiciona camadas do layout e extras; fundo troca só neste slide', () => {
    const s = montarSlide(LAYOUT_TESTE, {
      tipoId: 'cta',
      conteudo: {},
      overrides: {},
      camadasExtras: [texto('atras')],
      ordem: ['atras', 'header', 'titulo'],
      fundo: { tipo: 'cor', cor: '#123456' },
    });
    expect(ids(s.camadas).slice(0, 3)).toEqual(['atras', 'header', 'titulo']);
    expect(s.camadas).toHaveLength(LAYOUT_TESTE.tiposDeSlide[2]!.camadas.length + 1);
    expect(s.fundo).toEqual({ tipo: 'cor', cor: '#123456' });
  });
  it('montarSlides devolve o mesmo slide montado enquanto o slide do projeto não muda', () => {
    const projeto = { slides: [{ id: 'a', tipoId: 'capa', conteudo: {}, overrides: {}, camadasExtras: [] }] };
    const a = montarSlides(LAYOUT_TESTE, projeto);
    expect(montarSlides(LAYOUT_TESTE, projeto)[0]).toBe(a[0]);
    const mudou = { slides: [{ ...projeto.slides[0]!, conteudo: { titulo: 'Outro' } }] };
    expect(montarSlides(LAYOUT_TESTE, mudou)[0]).not.toBe(a[0]);
  });
});

describe('overrides: apagar propriedade, remover camada e trocar filhos', () => {
  it('null apaga a propriedade; removida tira a camada', () => {
    const cs = [texto('a', { sombra: { x: 0, y: 2, desfoque: 4, cor: '#000000' } }), texto('b')];
    const r = aplicarOverrides(cs, { a: { sombra: null }, b: { removida: true } });
    expect(ids(r)).toEqual(['a']);
    expect('sombra' in r[0]!).toBe(false);
  });
  it('"filhos" no ajuste troca os filhos e não aplica de novo ajustes neles', () => {
    const g: Camada = { id: 'g', tipo: 'grupo', x: 0, y: 0, w: 10, h: 10, filhos: [texto('a')] };
    // "b" foi para dentro do grupo e saiu do topo: o removida do topo não pode apagar o b de dentro do grupo
    const r = aplicarOverrides([g, texto('b')], { g: { filhos: [texto('a'), texto('b')] }, b: { removida: true } });
    expect(ids(r)).toEqual(['g']);
    expect(ids((r[0] as Extract<Camada, { tipo: 'grupo' }>).filhos)).toEqual(['a', 'b']);
  });
});

describe('faixa do projeto (ajustes e extras)', () => {
  it('extras e ordem da faixa entram na montagem e no layout com faixa', () => {
    const ajustes = {
      faixaOverrides: { 'linha-luz': { parametros: { espessura: 6, semente: 2 } } },
      faixaExtras: [texto('seta', { x: 900, w: 400 })],
    };
    expect(ids(faixaDoProjeto(LAYOUT_TESTE, ajustes))).toEqual(['linha-luz', 'seta']);
    expect(camadasDaFaixa(LAYOUT_TESTE, 4, ajustes)[0]).toMatchObject({ x: 0, w: 4320, parametros: { espessura: 6 } });
    const l = layoutComFaixa(LAYOUT_TESTE, ajustes);
    expect(ids(l.faixa!.camadas)).toEqual(['linha-luz', 'seta']);
    expect(layoutComFaixa(LAYOUT_TESTE, { faixaOverrides: {} })).toBe(LAYOUT_TESTE);
  });
  it('o projeto aceita faixaExtras e guias', () => {
    const p = Projeto.parse({
      id: 'p',
      nome: 'P',
      layoutId: 'l',
      brandKitId: 'k',
      formato: { w: 1080, h: 1350 },
      slides: [{ id: 's', tipoId: 'capa' }],
      guias: { x: [72], y: [1278] },
    });
    expect(p.faixaExtras).toEqual([]);
    expect(p.guias).toEqual({ x: [72], y: [1278] });
  });
});

describe('tokens {slide} e {total}', () => {
  it('escreve a posição do slide', () => {
    expect(resolverTexto('{slide}/{total}', KIT_TESTE, { slide: 2, total: 7 })).toBe('2/7');
    expect(resolverTexto('{slide}/{total} · {handle}', KIT_TESTE, { slide: 1, total: 3 })).toBe(
      '1/3 · @victoraragonez.dsg',
    );
    expect(resolverTexto('{slide}/{total}', KIT_TESTE)).toBe('{slide}/{total}');
  });
});

describe('linha de luz por pontos de controle', () => {
  it('converter a linha sorteada em pontos não muda o desenho', () => {
    for (const n of [2, 3, 8, 20]) {
      const p = { semente: 11 };
      const pontos = pontosDaSemente(n, 1080, 1350, p);
      // compara os números dos dois caminhos com tolerância de 0,2 px (o texto arredonda a 0,1)
      const numeros = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const a = numeros(caminhoLinhaDeLuz(n, 1080, 1350, { pontos }));
      const b = numeros(caminhoLinhaDeLuz(n, 1080, 1350, p));
      expect(a).toHaveLength(b.length);
      a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(0.2));
      // com os pontos arredondados (como o editor salva) continua dentro da tolerância
      const arred = pontos.map((q) => ({ ...q, x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
      numeros(caminhoLinhaDeLuz(n, 1080, 1350, { pontos: arred })).forEach((v, i) =>
        expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(0.2),
      );
      expect(pontos.at(-1)!.slide).toBe('ultimo');
    }
  });
  it('ponto preso ao slide: posição na faixa, último slide e ordem', () => {
    expect(pontoNaFaixaParaSlide(1500, 300, 3, 1080)).toEqual({ slide: 1, x: 420, y: 300 });
    expect(pontoNaFaixaParaSlide(2500, 300, 3, 1080)).toEqual({ slide: 'ultimo', x: 340, y: 300 });
    expect(pontoNaFaixaParaSlide(-50, 0, 3, 1080)).toEqual({ slide: 0, x: -50, y: 0 });
    const pts = pontosNaFaixa(
      [
        { slide: 1, x: 500, y: 2 },
        { slide: 0, x: 900, y: 1 },
        { slide: 'ultimo', x: 100, y: 3 },
      ],
      3,
      1080,
    );
    expect(pts).toEqual([
      [900, 1],
      [1580, 2],
      [2260, 3],
    ]);
  });
  it('carrossel encolhe: pontos de slides que sumiram saem e o último slide mostra só os pontos "ultimo"', () => {
    const pontos = [
      { slide: 0, x: 800, y: 100 },
      { slide: 3, x: 500, y: 200 },
      { slide: 6, x: 500, y: 300 },
      { slide: 'ultimo' as const, x: 80, y: 400 },
    ];
    expect(pontosNaFaixa(pontos, 4, 1080)).toEqual([
      [800, 100],
      [3 * 1080 + 80, 400],
    ]);
    expect(pontosNaFaixa(pontos, 8, 1080).map((p) => p[0])).toEqual([800, 3740, 6980, 7640]);
    // sem "ultimo": pontos do último slide existente continuam
    expect(pontosNaFaixa([{ slide: 2, x: 10, y: 0 }], 3, 1080)).toEqual([[2170, 0]]);
  });
  it('pontosDaLinha usa os pontos quando existem e a semente quando não', () => {
    expect(pontosDaLinha(3, 1080, 1350, { pontos: [{ slide: 0, x: 1, y: 2 }] })).toEqual([[1, 2]]);
    expect(pontosDaLinha(3, 1080, 1350, { semente: 4 }).length).toBeGreaterThan(2);
    expect(caminhoPorPontos([])).toBe('');
  });
});

describe('caminho SVG → pontos da linha (preparo para copiar a linha do Figma na Fase 4)', () => {
  it('lê comandos absolutos e relativos', () => {
    const sub = lerCaminho('M10 10 h 20 v 10 L 50 50 c 10 0 20 10 20 20 S 90 100 100 100 q 10 0 10 10 t 10 10 Z');
    expect(sub).toHaveLength(1);
    const segs = sub[0]!;
    expect(segs[0]).toMatchObject({ de: [10, 10], ate: [30, 10] });
    expect(segs[1]).toMatchObject({ ate: [30, 20] });
    expect(segs[3]).toMatchObject({
      de: [50, 50],
      ate: [70, 70],
      ctrl: [
        [60, 50],
        [70, 60],
      ],
    });
    // S reflete o controle anterior
    expect(segs[4]!.ctrl[0]).toEqual([70, 80]);
    expect(segs.at(-1)!.ate).toEqual([10, 10]);
  });
  it('amostra a cada passo e inclui as pontas', () => {
    const a = amostrarCaminho('M0 0 L 1000 0', 100);
    expect(a[0]).toEqual([0, 0]);
    expect(a.at(-1)).toEqual([1000, 0]);
    expect(a.length).toBeGreaterThanOrEqual(10);
  });
  it('a linha refeita pelos pontos fica a menos de 2 px do vetor original', () => {
    // vetor no tamanho da "Linha contínua" do Figma (6762×876 em x=870, y=230 de uma faixa de 8 slides)
    const d =
      'M0 120 C 600 -40 1100 700 1900 520 C 2700 340 2900 860 3700 760 C 4500 660 4700 60 5500 160 C 6100 240 6400 620 6762 560';
    const caixa = { x: 870, y: 230, w: 6762, h: 876 };
    const pontos = pontosDoCaminho(d, { caixa, n: 8, w: 1080 });
    expect(pontos[0]).toMatchObject({ slide: 0, x: 870, y: 350 });
    expect(pontos.at(-1)!.slide).toBe('ultimo');
    const refeita = pontosDensos(caminhoPorPontos(pontosNaFaixa(pontos, 8, 1080)), 32);
    const original = pontosDensos(d, 256).map(([x, y]) => [x + caixa.x, y + caixa.y] as const);
    let pior = 0;
    for (const [x, y] of original) {
      let perto = Infinity;
      for (const [a, b] of refeita) perto = Math.min(perto, Math.hypot(a - x, b - y));
      pior = Math.max(pior, perto);
    }
    expect(pior).toBeLessThan(2);
  });
  it('viewBox diferente da caixa escala os pontos', () => {
    const p = pontosDoCaminho('M0 0 L 100 50', {
      caixa: { x: 0, y: 0, w: 1000, h: 500 },
      viewBox: { w: 100, h: 50 },
      n: 1,
      w: 1080,
    });
    expect(p.at(-1)).toMatchObject({ x: 1000, y: 500 });
  });
});

describe('gradiente das formas SVG como no CSS', () => {
  it('vetor pelo centro, direção (sen θ, −cos θ) e comprimento |w·sen θ| + |h·cos θ|', () => {
    const w = 400;
    const h = 250;
    const perto = (v: Record<string, number>, e: Record<string, number>) =>
      Object.keys(e).forEach((k) => expect(v[k]).toBeCloseTo(e[k]!, 6));
    perto(vetorDoGradiente(0, w, h), { x1: 200, y1: 250, x2: 200, y2: 0 });
    perto(vetorDoGradiente(90, w, h), { x1: 0, y1: 125, x2: 400, y2: 125 });
    perto(vetorDoGradiente(180, w, h), { x1: 200, y1: 0, x2: 200, y2: 250 });
    const v = vetorDoGradiente(45, w, h);
    const L = (w + h) * Math.SQRT1_2;
    expect(Math.hypot(v.x2 - v.x1, v.y2 - v.y1)).toBeCloseTo(L, 6);
    expect((v.x1 + v.x2) / 2).toBeCloseTo(200, 6);
    expect((v.y1 + v.y2) / 2).toBeCloseTo(125, 6);
  });
});

describe('cache do auto-ajuste', () => {
  it('a chave muda com texto, fonte, caixa e versão das fontes, e não com a cor', () => {
    const base = {
      trechos: [{ texto: 'Oi', destaque: false }],
      base: { fontFamily: 'A', fontWeight: 300, color: '#fff' },
      destaque: {},
      w: 100,
      h: 50,
      max: 90,
      min: 12,
      versaoFontes: 1,
    };
    const k = chaveDaMedida(base);
    expect(chaveDaMedida({ ...base, base: { ...base.base, color: '#000' } })).toBe(k);
    expect(chaveDaMedida({ ...base, trechos: [{ texto: 'Oi!', destaque: false }] })).not.toBe(k);
    expect(chaveDaMedida({ ...base, trechos: [{ texto: 'Oi', destaque: true }] })).not.toBe(k);
    expect(chaveDaMedida({ ...base, base: { ...base.base, fontWeight: 400 } })).not.toBe(k);
    expect(chaveDaMedida({ ...base, w: 101 })).not.toBe(k);
    expect(chaveDaMedida({ ...base, versaoFontes: 2 })).not.toBe(k);
  });
});
