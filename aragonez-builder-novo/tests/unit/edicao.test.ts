import { describe, expect, it } from 'vitest';
import {
  copiarComIdsNovos,
  diferencaDoSlide,
  idsDaArvore,
  igual,
  materializar,
  paraProjeto,
  salvarComoLayout,
  type DocumentoEditavel,
} from '@/dominio/edicao';
import { faixaDoProjeto, montarSlides } from '@/dominio/montagem';
import { Layout, Projeto, validar, type Camada, type CamadaTexto } from '@/dominio/schemas';
import { LAYOUT_TESTE, projetoTeste } from '@/seeds/teste';

const projetoBase = (): Projeto =>
  Projeto.parse({
    ...projetoTeste(3),
    id: 'p1',
    nome: 'Teste',
    layoutId: LAYOUT_TESTE.id,
    brandKitId: 'kit-teste',
    formato: LAYOUT_TESTE.formato,
  });

/** Ida e volta: salvar o documento como projeto e montar de novo tem de dar exatamente o que estava no editor. */
function idaEVolta(doc: DocumentoEditavel) {
  const p = Projeto.parse(paraProjeto(projetoBase(), LAYOUT_TESTE, doc));
  const montados = montarSlides(LAYOUT_TESTE, p);
  doc.slides.forEach((s, i) => {
    expect(igual(montados[i]!.camadas, s.camadas), `camadas do slide ${i}`).toBe(true);
    expect(montados[i]!.fundo).toEqual(s.fundo ?? montados[i]!.tipo.fundo);
  });
  expect(igual(faixaDoProjeto(LAYOUT_TESTE, p), doc.faixa), 'faixa').toBe(true);
  return p;
}

const editar = (f: (d: DocumentoEditavel) => void) => {
  const d = structuredClone(materializar(LAYOUT_TESTE, projetoBase()));
  f(d);
  return d;
};
const camada = (d: DocumentoEditavel, i: number, id: string) => d.slides[i]!.camadas.find((c) => c.id === id)!;

describe('editor ↔ projeto (materializar e salvar a diferença)', () => {
  it('sem edição, o projeto salvo só tem os ajustes que mudam algo (o redundante sai)', () => {
    // 4 slides: Capa, Conteúdo "02", Conteúdo "03", CTA. O "02" é igual ao texto do layout; o "03" não.
    const p4 = Projeto.parse({ ...projetoBase(), ...projetoTeste(4), id: 'p1', nome: 'Teste' });
    expect(p4.slides.map((s) => s.overrides)).toEqual([{}, { num: { texto: '02' } }, { num: { texto: '03' } }, {}]);
    const salvo = paraProjeto(p4, LAYOUT_TESTE, materializar(LAYOUT_TESTE, p4));
    expect(salvo.slides.map((s) => s.overrides)).toEqual([{}, {}, { num: { texto: '03' } }, {}]);
    salvo.slides.forEach((s) => expect([s.conteudo, s.camadasExtras, s.ordem]).toEqual([{}, [], undefined]));
    // e o desenho é o mesmo
    const antes = montarSlides(LAYOUT_TESTE, p4);
    montarSlides(LAYOUT_TESTE, salvo).forEach((s, i) => expect(igual(s.camadas, antes[i]!.camadas)).toBe(true));
  });

  it('texto de campo editável vai para o conteúdo; de camada fixa, para o ajuste', () => {
    const d = editar((d) => {
      (camada(d, 0, 'titulo') as CamadaTexto).texto = 'Novo *título*';
      (camada(d, 0, 'arraste') as CamadaTexto).texto = 'Arraste →';
    });
    const p = idaEVolta(d);
    expect(p.slides[0]!.conteudo).toEqual({ titulo: 'Novo *título*' });
    expect(p.slides[0]!.overrides).toEqual({ arraste: { texto: 'Arraste →' } });
  });

  it('mover, apagar propriedade, remover camada do layout e criar extra', () => {
    const d = editar((d) => {
      Object.assign(camada(d, 1, 'titulo'), { x: 100, y: 300 });
      delete (camada(d, 1, 'caixa') as Record<string, unknown>).sombra;
      d.slides[1]!.camadas = d.slides[1]!.camadas.filter((c) => c.id !== 'bola');
      d.slides[1]!.camadas.push({ id: 'selo-novo', tipo: 'forma', forma: 'elipse', x: 1, y: 2, w: 30, h: 30 });
    });
    const p = idaEVolta(d);
    expect(p.slides[1]!.overrides.titulo).toEqual({ x: 100, y: 300 });
    expect(p.slides[1]!.overrides.caixa).toEqual({ sombra: null });
    expect(p.slides[1]!.overrides.bola).toEqual({ removida: true });
    expect(p.slides[1]!.camadasExtras.map((c) => c.id)).toEqual(['selo-novo']);
    expect(p.slides[1]!.ordem).toBeUndefined();
  });

  it('reordenar camadas do layout e extras grava a ordem', () => {
    const d = editar((d) => {
      const cs = d.slides[2]!.camadas;
      cs.unshift({ id: 'atras', tipo: 'forma', forma: 'retangulo', x: 0, y: 0, w: 10, h: 10 });
      cs.push(cs.splice(1, 1)[0]!); // o primeiro do layout vai para o topo
    });
    const p = idaEVolta(d);
    expect(p.slides[2]!.ordem![0]).toBe('atras');
  });

  it('agrupar camadas do layout (com campo editável dentro) e desagrupar de volta', () => {
    const base = materializar(LAYOUT_TESTE, projetoBase());
    const d = editar((d) => {
      const cs = d.slides[0]!.camadas;
      const titulo = cs.find((c) => c.id === 'titulo')!;
      const sub = cs.find((c) => c.id === 'subtitulo')!;
      const grupo: Camada = {
        id: 'g1',
        tipo: 'grupo',
        x: 120,
        y: 472,
        w: 880,
        h: 553,
        filhos: [{ ...titulo, x: 0, y: 0, texto: 'Dentro do *grupo*' } as Camada, { ...sub, x: 0, y: 445 }],
      };
      d.slides[0]!.camadas = [...cs.filter((c) => c !== titulo && c !== sub), grupo];
    });
    const p = idaEVolta(d);
    expect(p.slides[0]!.overrides.titulo).toEqual({ removida: true });
    expect(p.slides[0]!.camadasExtras[0]!.id).toBe('g1');
    // desagrupar: os filhos voltam para o topo com a posição absoluta, no lugar do grupo
    const g = d.slides[0]!.camadas.find((c) => c.id === 'g1') as Extract<Camada, { tipo: 'grupo' }>;
    const soltos = g.filhos.map((f) => ({ ...f, x: f.x + g.x, y: f.y + g.y }));
    d.slides[0]!.camadas = d.slides[0]!.camadas.flatMap((c) => (c.id === 'g1' ? soltos : [c]));
    const p2 = idaEVolta(d);
    expect(p2.slides[0]!.camadasExtras).toEqual([]);
    expect(p2.slides[0]!.overrides.titulo).toBeUndefined();
    expect(p2.slides[0]!.conteudo).toEqual({ titulo: 'Dentro do *grupo*' });
    // com o texto original de volta, a capa volta a ser só o layout (a ordem mudou: título e subtítulo no topo)
    (d.slides[0]!.camadas.find((c) => c.id === 'titulo') as CamadaTexto).texto = (
      base.slides[0]!.camadas.find((c) => c.id === 'titulo') as CamadaTexto
    ).texto;
    const p3 = idaEVolta(d);
    expect([p3.slides[0]!.conteudo, p3.slides[0]!.overrides]).toEqual([{}, {}]);
    expect(p3.slides[0]!.ordem!.slice(-2)).toEqual(['titulo', 'subtitulo']);
  });

  it('grupo do layout: filho editado desce camada a camada; filho novo leva a lista pronta', () => {
    const tipo = {
      id: 't',
      nome: 'T',
      fundo: { tipo: 'cor' as const, cor: '#000000' },
      camadas: [
        {
          id: 'g',
          tipo: 'grupo' as const,
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          filhos: [{ id: 'a', tipo: 'texto' as const, x: 0, y: 0, w: 10, h: 10, texto: 'A', editavel: true }],
        },
      ],
    };
    const ed = structuredClone(tipo.camadas) as Camada[];
    ((ed[0] as Extract<Camada, { tipo: 'grupo' }>).filhos[0] as CamadaTexto).texto = 'B';
    expect(diferencaDoSlide(tipo, { id: 's', tipoId: 't', camadas: ed })).toMatchObject({
      conteudo: { a: 'B' },
      overrides: {},
    });
    (ed[0] as Extract<Camada, { tipo: 'grupo' }>).filhos.push({
      id: 'b',
      tipo: 'texto',
      x: 0,
      y: 20,
      w: 10,
      h: 10,
      texto: 'novo',
    });
    const r = diferencaDoSlide(tipo, { id: 's', tipoId: 't', camadas: ed });
    expect((r.overrides.g!.filhos as Camada[]).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('imagem editável: trocar a foto vai para o conteúdo; fundo trocado só no slide', () => {
    const d = editar((d) => {
      Object.assign(camada(d, 0, 'foto'), { editavel: true });
      d.slides[0]!.fundo = { tipo: 'cor', cor: '#222222' };
    });
    const p0 = idaEVolta(d);
    expect(p0.slides[0]!.overrides.foto).toEqual({ editavel: true });
    expect(p0.slides[0]!.fundo).toEqual({ tipo: 'cor', cor: '#222222' });
    const d2 = editar((d) => Object.assign(camada(d, 0, 'foto'), { url: 'blob:outra', zoom: 2 }));
    const p = idaEVolta(d2);
    // a foto do layout de teste não é editável: vai para o ajuste
    expect(p.slides[0]!.overrides.foto).toEqual({ url: 'blob:outra', zoom: 2 });
  });

  it('faixa: pontos da linha, camada nova atravessando e ordem', () => {
    const d = editar((d) => {
      Object.assign(d.faixa[0]!, {
        pontos: [
          { slide: 0, x: 10, y: 20 },
          { slide: 'ultimo', x: 30, y: 40 },
        ],
      });
      d.faixa.unshift({ id: 'seta', tipo: 'icone', nome: 'seta', x: 900, y: 600, w: 300, h: 100 });
    });
    const p = idaEVolta(d);
    expect(p.faixaOverrides['linha-luz']!.pontos).toHaveLength(2);
    expect(p.faixaExtras.map((c) => c.id)).toEqual(['seta']);
    expect(p.faixaOrdem).toEqual(['seta', 'linha-luz']);
  });

  it('o projeto salvo continua re-vestindo quando o layout muda (só guarda a diferença)', () => {
    const d = editar((d) => Object.assign(camada(d, 0, 'titulo'), { x: 200 }));
    const p = paraProjeto(projetoBase(), LAYOUT_TESTE, d);
    const outroLayout = structuredClone(LAYOUT_TESTE);
    Object.assign(
      outroLayout.tiposDeSlide[0]!.camadas.find((c) => c.id === 'titulo')!,
      { cor: '#00FF00' },
    );
    const t = montarSlides(outroLayout, p)[0]!.camadas.find((c) => c.id === 'titulo') as CamadaTexto;
    expect([t.x, t.cor]).toEqual([200, '#00FF00']);
  });
});

describe('Salvar como layout', () => {
  it('as extras e os ajustes viram camadas do tipo de slide; o layout novo valida e reproduz o projeto', () => {
    const d = editar((d) => {
      d.slides[0]!.camadas.push({ id: 'selo', tipo: 'texto', x: 10, y: 10, w: 200, h: 40, texto: 'NOVO' });
      Object.assign(camada(d, 0, 'titulo'), { y: 500 });
    });
    const p = paraProjeto(projetoBase(), LAYOUT_TESTE, d);
    const { layout, tipoDoSlide } = salvarComoLayout(LAYOUT_TESTE, p, { id: 'meu', nome: 'Meu layout' });
    expect(validar(Layout, layout).ok).toBe(true);
    expect(layout).toMatchObject({ id: 'meu', nome: 'Meu layout', status: 'rascunho', origem: 'editor' });
    expect(tipoDoSlide).toEqual(['capa', 'conteudo', 'cta']);
    const capa = layout.tiposDeSlide.find((t) => t.id === 'capa')!;
    expect(capa.camadas.map((c) => c.id)).toContain('selo');
    expect(capa.camadas.find((c) => c.id === 'titulo')!.y).toBe(500);
    // um projeto novo com o layout salvo (sem conteúdo nem ajustes) mostra a mesma coisa
    const novos = montarSlides(layout, {
      slides: tipoDoSlide.map((tipoId, i) => ({ id: `n${i}`, tipoId, conteudo: {}, overrides: {}, camadasExtras: [] })),
    });
    novos.forEach((s, i) => expect(igual(s.camadas, d.slides[i]!.camadas), `slide ${i}`).toBe(true));
  });

  it('slides do mesmo tipo com design diferente viram tipos separados; só texto diferente não', () => {
    const p = Projeto.parse({ ...projetoBase(), ...projetoTeste(5) });
    const d = materializar(LAYOUT_TESTE, p);
    // slide 2 (conteúdo) ganha um elemento; os slides 1 e 3 só mudam o número (texto)
    d.slides[2]!.camadas.push({ id: 'extra', tipo: 'forma', forma: 'retangulo', x: 0, y: 0, w: 5, h: 5 });
    const salvo = paraProjeto(p, LAYOUT_TESTE, d);
    const { layout, tipoDoSlide } = salvarComoLayout(LAYOUT_TESTE, salvo, { id: 'x', nome: 'X' });
    expect(tipoDoSlide).toEqual(['capa', 'conteudo', 'conteudo-2', 'conteudo', 'cta']);
    expect(layout.tiposDeSlide.find((t) => t.id === 'conteudo-2')!.nome).toBe('Conteúdo 2');
  });

  it('a faixa do layout salvo leva os pontos da linha e as extras', () => {
    const d = editar((d) => {
      Object.assign(d.faixa[0]!, { pontos: [{ slide: 0, x: 1, y: 2 }] });
      d.faixa.push({ id: 'seta', tipo: 'icone', nome: 'seta', x: 900, y: 600, w: 300, h: 100 });
    });
    const { layout } = salvarComoLayout(LAYOUT_TESTE, paraProjeto(projetoBase(), LAYOUT_TESTE, d), {
      id: 'f',
      nome: 'F',
    });
    expect(layout.faixa!.camadas.map((c) => c.id)).toEqual(['linha-luz', 'seta']);
    expect((layout.faixa!.camadas[0] as Extract<Camada, { tipo: 'forma' }>).pontos).toEqual([{ slide: 0, x: 1, y: 2 }]);
    expect(layout.faixa!.camadas[0]!.estica).toBe(true);
  });
});

describe('garantias do editor ↔ projeto', () => {
  /** Projeto como o editor cria (sem ajustes) e um com ajustes de verdade (conteúdo, ajuste, extra, faixa). */
  const limpo = (): Projeto => ({
    ...projetoBase(),
    slides: projetoBase().slides.map((s) => ({ ...s, overrides: {} })),
  });
  const ajustado = (): Projeto => {
    const p = limpo();
    p.slides[0]!.conteudo = { titulo: 'Outro *título*' };
    p.slides[0]!.overrides = { arraste: { x: 650 }, sublinhado: { removida: true } };
    p.slides[1]!.camadasExtras = [{ id: 'selo-extra', tipo: 'texto', x: 5, y: 5, w: 100, h: 30, texto: 'Selo extra' }];
    p.slides[2]!.fundo = { tipo: 'cor', cor: '#101010' };
    p.faixaOverrides = { 'linha-luz': { parametros: { espessura: 5, semente: 3 } } };
    return p;
  };

  it('1. abrir e salvar sem mexer não gera ajuste, extra nem ordem: o projeto sai igual ao que entrou', () => {
    for (const entrada of [limpo(), ajustado()]) {
      const saida = paraProjeto(entrada, LAYOUT_TESTE, materializar(LAYOUT_TESTE, entrada));
      expect(saida).toEqual(entrada);
    }
    const s = paraProjeto(limpo(), LAYOUT_TESTE, materializar(LAYOUT_TESTE, limpo()));
    s.slides.forEach((sl) => {
      expect(sl.overrides).toEqual({});
      expect(sl.camadasExtras).toEqual([]);
      expect(sl.ordem).toBeUndefined();
    });
    expect(s.faixaOverrides).toEqual({});
    expect(s.faixaExtras).toEqual([]);
    expect(s.faixaOrdem).toBeUndefined();
  });

  it('2. editar, salvar e reabrir: o slide montado é idêntico ao que estava no editor', () => {
    const doc = structuredClone(materializar(LAYOUT_TESTE, ajustado()));
    const cs = doc.slides[1]!.camadas;
    Object.assign(
      cs.find((c) => c.id === 'titulo')!,
      { x: 140, y: 360 },
    ); // mover o título
    (cs.find((c) => c.id === 'lista') as CamadaTexto).texto = 'Um\nDois'; // trocar um texto
    doc.slides[1]!.camadas = cs.filter((c) => c.id !== 'icone'); // apagar camada do layout
    doc.slides[1]!.camadas.push({ id: 'nota', tipo: 'texto', x: 72, y: 1250, w: 500, h: 40, texto: 'Nota' }); // extra
    doc.slides[1]!.camadas.unshift(doc.slides[1]!.camadas.pop()!); // reordenar: a nota vai para baixo de tudo
    const salvo = Projeto.parse(paraProjeto(ajustado(), LAYOUT_TESTE, doc));
    const reaberto = materializar(LAYOUT_TESTE, salvo);
    expect(igual(reaberto, doc)).toBe(true);
    expect(montarSlides(LAYOUT_TESTE, salvo)[1]!.camadas.map((c) => c.id)[0]).toBe('nota');
  });

  it('3. o layout continua mandando no que o projeto não ajustou', () => {
    const doc = structuredClone(materializar(LAYOUT_TESTE, limpo()));
    Object.assign(
      doc.slides[0]!.camadas.find((c) => c.id === 'titulo')!,
      { cor: '#00FF00' },
    );
    const salvo = paraProjeto(limpo(), LAYOUT_TESTE, doc);
    const layoutNovo = structuredClone(LAYOUT_TESTE);
    const capa = layoutNovo.tiposDeSlide[0]!.camadas;
    Object.assign(
      capa.find((c) => c.id === 'etiqueta')!,
      { cor: '#0000FF' },
    ); // não ajustada no projeto
    Object.assign(
      capa.find((c) => c.id === 'titulo')!,
      { cor: '#FF0000', y: 480 },
    ); // cor ajustada, y não
    const m = montarSlides(layoutNovo, salvo)[0]!.camadas;
    expect((m.find((c) => c.id === 'etiqueta') as CamadaTexto).cor).toBe('#0000FF');
    expect((m.find((c) => c.id === 'titulo') as CamadaTexto).cor).toBe('#00FF00');
    expect(m.find((c) => c.id === 'titulo')!.y).toBe(480);
  });

  it('4. duplicar uma camada do layout gera id novo: dois títulos independentes ao reabrir', () => {
    const doc = structuredClone(materializar(LAYOUT_TESTE, limpo()));
    const cs = doc.slides[0]!.camadas;
    const titulo = cs.find((c) => c.id === 'titulo')!;
    const [copia] = copiarComIdsNovos([titulo], idsDaArvore(cs));
    expect(copia!.id).toBe('titulo-2');
    Object.assign(copia!, { y: 100, texto: 'Cópia' });
    cs.push(copia!);
    Object.assign(titulo, { x: 130 });
    const salvo = paraProjeto(limpo(), LAYOUT_TESTE, doc);
    const m = montarSlides(LAYOUT_TESTE, salvo)[0]!.camadas.filter((c) => c.id.startsWith('titulo'));
    expect(m.map((c) => [c.id, c.x, c.y, (c as CamadaTexto).texto])).toEqual([
      ['titulo', 130, 472, 'Prompt bonito\nnão paga *boleto.*'],
      ['titulo-2', 120, 100, 'Cópia'],
    ]);
    // o ajuste da original não vai para a cópia (e vice-versa)
    expect(salvo.slides[0]!.overrides.titulo).toEqual({ x: 130 });
    // grupo copiado: os filhos também ganham ids novos
    const g: Camada = { id: 'g', tipo: 'grupo', x: 0, y: 0, w: 1, h: 1, filhos: [titulo] };
    const [gc] = copiarComIdsNovos([g], idsDaArvore([...cs, g]));
    expect(idsDaArvore([gc!])).toEqual(new Set(['g-2', 'titulo-3']));
  });

  it('4b. rede de segurança: id repetido no editor ganha id novo ao salvar (não herda os ajustes da original)', () => {
    const doc = structuredClone(materializar(LAYOUT_TESTE, limpo()));
    const cs = doc.slides[0]!.camadas;
    const titulo = cs.find((c) => c.id === 'titulo')!;
    cs.push({ ...structuredClone(titulo), y: 50 });
    Object.assign(titulo, { x: 300 });
    const salvo = paraProjeto(limpo(), LAYOUT_TESTE, doc);
    const ids = montarSlides(LAYOUT_TESTE, salvo)[0]!.camadas.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const copia = salvo.slides[0]!.camadasExtras[0]!;
    expect([copia.id, copia.x, copia.y]).toEqual(['titulo-2', 120, 50]);
  });

  it('projeto salvo com extra de id repetido (igual a uma camada do layout): resolvido ao abrir, desenho igual', () => {
    // o tipo "Conteúdo" já tem a camada "selo" (COMBO); a extra abaixo repete o id
    const p = limpo();
    p.slides[1]!.camadasExtras = [{ id: 'selo', tipo: 'texto', x: 5, y: 5, w: 100, h: 30, texto: 'Selo' }];
    const doc = materializar(LAYOUT_TESTE, p);
    const ids = doc.slides[1]!.camadas.map((c) => c.id);
    expect(ids.slice(-2)).toEqual(['bola', 'selo-2']);
    expect(new Set(ids).size).toBe(ids.length);
    // o desenho é o mesmo (só o id da extra mudou)
    const semIds = (cs: Camada[]) => cs.map(({ id: _i, ...r }) => r);
    expect(igual(semIds(doc.slides[1]!.camadas), semIds(montarSlides(LAYOUT_TESTE, p)[1]!.camadas))).toBe(true);
    // primeiro salvamento grava o id novo; daí em diante abrir e salvar não muda mais nada
    const salvo = paraProjeto(p, LAYOUT_TESTE, doc);
    expect(salvo.slides[1]!.camadasExtras[0]!.id).toBe('selo-2');
    expect(paraProjeto(salvo, LAYOUT_TESTE, materializar(LAYOUT_TESTE, salvo))).toEqual(salvo);
  });

  it('layout ganha depois uma camada com o id de uma extra do projeto: a extra continua separada', () => {
    // o projeto tinha a extra "carimbo"; depois o layout ganhou uma camada "carimbo" própria
    const p = limpo();
    p.slides[0]!.camadasExtras = [{ id: 'carimbo', tipo: 'texto', x: 40, y: 40, w: 300, h: 60, texto: 'Do projeto' }];
    p.slides[0]!.conteudo = { carimbo: 'Conteúdo do campo do layout' };
    const layout2 = structuredClone(LAYOUT_TESTE);
    layout2.tiposDeSlide[0]!.camadas.push({
      id: 'carimbo',
      tipo: 'texto',
      x: 700,
      y: 60,
      w: 300,
      h: 60,
      texto: 'Do layout',
      cor: '#0000FF',
      editavel: true,
    });
    const doLayout = (cs: Camada[]) => cs.filter((c) => c.id.startsWith('carimbo'));
    // a montagem (miniatura, exportação) já resolve, sem passar pelo editor
    const m = doLayout(montarSlides(layout2, p)[0]!.camadas) as CamadaTexto[];
    expect(m.map((c) => [c.id, c.texto, c.x, c.cor])).toEqual([
      ['carimbo', 'Conteúdo do campo do layout', 700, '#0000FF'],
      ['carimbo-2', 'Do projeto', 40, undefined],
    ]);
    // o editor vê as mesmas camadas; salvar grava o id novo uma vez só
    const doc = materializar(layout2, p);
    expect(igual(doc.slides[0]!.camadas, montarSlides(layout2, p)[0]!.camadas)).toBe(true);
    const salvo = paraProjeto(p, layout2, doc);
    expect(salvo.slides[0]!.camadasExtras.map((c) => c.id)).toEqual(['carimbo-2']);
    const deNovo = paraProjeto(salvo, layout2, materializar(layout2, salvo));
    expect(deNovo).toEqual(salvo);
  });

  it('Salvar como layout: reabrir o projeto no layout novo dá o mesmo desenho, slide a slide', () => {
    const p = Projeto.parse({ ...ajustado(), ...projetoTeste(5), id: 'p1', nome: 'Teste' });
    p.slides[0]!.camadasExtras = [{ id: 'selo', tipo: 'texto', x: 10, y: 10, w: 200, h: 40, texto: 'NOVO' }];
    p.slides[2]!.conteudo = { titulo: 'Texto só deste slide' };
    p.faixaOverrides = { 'linha-luz': { parametros: { espessura: 5 } } };
    const antes = montarSlides(LAYOUT_TESTE, p);
    const { layout, projeto } = salvarComoLayout(LAYOUT_TESTE, p, { id: 'novo', nome: 'Novo' });
    expect(projeto.layoutId).toBe('novo');
    const depois = montarSlides(layout, projeto);
    expect(depois).toHaveLength(antes.length);
    depois.forEach((s, i) => {
      expect(igual(s.camadas, antes[i]!.camadas), `camadas do slide ${i + 1}`).toBe(true);
      expect(s.fundo).toEqual(antes[i]!.fundo);
    });
    expect(igual(faixaDoProjeto(layout, projeto), faixaDoProjeto(LAYOUT_TESTE, p))).toBe(true);
    // no layout novo o projeto quase não precisa de ajustes: extras e faixa foram para o layout
    expect(projeto.slides.every((s) => s.camadasExtras.length === 0)).toBe(true);
    expect(projeto.faixaOverrides).toEqual({});
  });
});
