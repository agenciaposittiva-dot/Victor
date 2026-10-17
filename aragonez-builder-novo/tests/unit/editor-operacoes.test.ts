import { describe, expect, it } from 'vitest';
import { materializar, paraProjeto, type DocumentoEditavel } from '@/dominio/edicao';
import { camadasDaFaixa, montarSlides } from '@/dominio/montagem';
import { Projeto, type Camada, type CamadaForma, type CamadaTexto } from '@/dominio/schemas';
import { caixaDeContorno } from '@/editor/geometria';
import {
  acharCamada,
  adicionar,
  adicionarPonto,
  adicionarSlide,
  agrupar,
  alinhar,
  caixaNoDocumento,
  colar,
  desagrupar,
  distribuir,
  duplicar,
  excluirSlide,
  garantirPontos,
  motivoParaNaoAgrupar,
  mover,
  moverParaFaixa,
  moverPonto,
  moverSlide,
  prenderAoSlide,
  removerPonto,
  reordenar,
  restaurarLinhaSorteada,
  trocarTipo,
  type Contexto,
} from '@/editor/operacoes';
import { KIT_TESTE, LAYOUT_TESTE, projetoTeste } from '@/seeds/teste';

const CTX: Contexto = { w: 1080, h: 1350, continuo: true };
const projeto = (): Projeto =>
  Projeto.parse({
    ...projetoTeste(3),
    id: 'p',
    nome: 'P',
    layoutId: LAYOUT_TESTE.id,
    brandKitId: KIT_TESTE.id,
    formato: LAYOUT_TESTE.formato,
  });
const doc = (): DocumentoEditavel => structuredClone(materializar(LAYOUT_TESTE, projeto()));
const ids = (cs: Camada[]) => cs.map((c) => c.id);
const caixa = (d: DocumentoEditavel, dono: number | 'faixa', id: string) => caixaNoDocumento(d, dono, id, CTX)!;
const ret = (d: DocumentoEditavel, dono: number | 'faixa', id: string) => caixaDeContorno(caixa(d, dono, id));

describe('operações do editor', () => {
  it('agrupar e desagrupar (inclusive grupo girado) mantém o lugar na tela', () => {
    const d = doc();
    const antes = { t: caixa(d, 0, 'titulo'), s: caixa(d, 0, 'subtitulo') };
    const g = agrupar(d, 0, ['titulo', 'subtitulo'])!;
    expect(g).toMatch(/^grupo-/);
    expect(caixa(d, 0, 'titulo')).toEqual(antes.t); // dentro do grupo, mesma posição na tela
    const grupo = acharCamada(d, 0, g) as Extract<Camada, { tipo: 'grupo' }>;
    expect(ids(grupo.filhos)).toEqual(['titulo', 'subtitulo']);
    // o grupo fica onde estava a camada de cima (subtítulo)
    expect(ids(d.slides[0]!.camadas)).toEqual(['foto', 'etiqueta', 'sublinhado', g, 'header', 'arraste']);
    // girar o grupo 90° e desagrupar: os filhos giram junto, em volta do centro do grupo
    grupo.rotacao = 90;
    const gc = { x: grupo.x + grupo.w / 2, y: grupo.y + grupo.h / 2 };
    desagrupar(d, 0, [g]);
    const t = acharCamada(d, 0, 'titulo')!;
    expect(t.rotacao).toBe(90);
    const tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
    const tcAntes = { x: antes.t.x + antes.t.w / 2, y: antes.t.y + antes.t.h / 2 };
    // centro do título girado 90° em volta do centro do grupo
    expect(tc.x).toBeCloseTo(gc.x - (tcAntes.y - gc.y), 0);
    expect(tc.y).toBeCloseTo(gc.y + (tcAntes.x - gc.x), 0);
  });

  it('não agrupa camada com "estica" ou âncora: a linha de luz continua atravessando todos os slides', () => {
    const d = doc();
    const seta = adicionar(d, 'faixa', { tipo: 'icone', nome: 'seta', x: 900, y: 600, w: 300, h: 100 });
    expect(motivoParaNaoAgrupar(d, 'faixa', ['linha-luz', seta])).toMatch(/acompanha a quantidade de slides/);
    expect(agrupar(d, 'faixa', ['linha-luz', seta])).toBeNull();
    adicionarSlide(d, LAYOUT_TESTE, 'conteudo', 2);
    const p = paraProjeto(projeto(), LAYOUT_TESTE, d);
    const linha = camadasDaFaixa(LAYOUT_TESTE, p.slides.length, p).find((c) => c.id === 'linha-luz')!;
    expect([linha.x, linha.w]).toEqual([0, 4 * 1080]);
  });

  it('distribuir com espaços iguais e alinhar (seleção, slide e, na faixa, o slide do elemento)', () => {
    const d = doc();
    const a = adicionar(d, 1, { tipo: 'forma', forma: 'retangulo', x: 100, y: 0, w: 100, h: 50 });
    const b = adicionar(d, 1, { tipo: 'forma', forma: 'retangulo', x: 260, y: 0, w: 40, h: 50 });
    const c = adicionar(d, 1, { tipo: 'forma', forma: 'retangulo', x: 700, y: 0, w: 100, h: 50 });
    distribuir(d, 1, [c, a, b], 'h', CTX);
    const [ra, rb, rc] = [a, b, c].map((id) => ret(d, 1, id));
    expect(rb!.x - (ra!.x + ra!.w)).toBeCloseTo(rc!.x - (rb!.x + rb!.w), 6);
    alinhar(d, 1, [a, c], 'base', CTX);
    expect(acharCamada(d, 1, a)!.y).toBe(0);
    // um elemento só: alinha ao slide dele (no contínuo, o slide 2 começa em 1080)
    alinhar(d, 1, [b], 'direita', CTX);
    expect(ret(d, 1, b).x + ret(d, 1, b).w).toBeCloseTo(2 * 1080, 6);
    // na faixa, um elemento no slide 3 alinha ao slide 3 (não ao primeiro)
    const s = adicionar(d, 'faixa', { tipo: 'forma', forma: 'elipse', x: 2300, y: 100, w: 100, h: 100 });
    alinhar(d, 'faixa', [s], 'esquerda', CTX);
    expect(acharCamada(d, 'faixa', s)!.x).toBe(2160);
  });

  it('reordenar: frente, trás, subir e descer na lista da camada', () => {
    const d = doc();
    reordenar(d, 2, ['header'], 'frente');
    expect(ids(d.slides[2]!.camadas).at(-1)).toBe('header');
    reordenar(d, 2, ['header'], 'tras');
    expect(ids(d.slides[2]!.camadas)[0]).toBe('header');
    reordenar(d, 2, ['header'], 'subir');
    expect(ids(d.slides[2]!.camadas).slice(0, 2)).toEqual(['titulo', 'header']);
    reordenar(d, 2, ['header'], 'descer');
    expect(ids(d.slides[2]!.camadas)[0]).toBe('header');
  });

  it('mover para a faixa e prender de volta mantém o lugar na tela', () => {
    const d = doc();
    const antes = caixa(d, 1, 'bola');
    const [naFaixa] = moverParaFaixa(d, 1, ['bola'], CTX);
    expect(ids(d.slides[1]!.camadas)).not.toContain('bola');
    expect(caixa(d, 'faixa', naFaixa!)).toEqual(antes);
    const [deVolta] = prenderAoSlide(d, [naFaixa!], 2, CTX);
    expect(caixa(d, 2, deVolta!)).toEqual(antes); // agora relativo ao slide 3, mesmo lugar na tela
    expect(acharCamada(d, 2, deVolta!)!.x).toBe(antes.x - 2 * 1080);
  });

  it('duplicar e colar geram ids novos; elemento novo tem id único', () => {
    const d = doc();
    const [copia] = duplicar(d, 0, ['titulo']);
    expect(copia).toBe('titulo-2');
    const coladas = colar(d, 0, [acharCamada(d, 0, 'titulo')!]);
    expect(coladas).toEqual(['titulo-3']);
    expect(acharCamada(d, 0, 'titulo-3')!.x).toBe(acharCamada(d, 0, 'titulo')!.x + 24);
    const novo = adicionar(d, 0, { tipo: 'texto', x: 0, y: 0, w: 10, h: 10, texto: 'Oi' });
    expect(novo).toMatch(/^texto-[0-9a-z]{12}$/);
    mover(d, 0, [novo], 10.04, -3.06);
    expect([acharCamada(d, 0, novo)!.x, acharCamada(d, 0, novo)!.y]).toEqual([10, -3.1]);
  });

  it('slides: adicionar, mover, excluir (fica pelo menos 1) e trocar o tipo levando o conteúdo', () => {
    const d = doc();
    adicionarSlide(d, LAYOUT_TESTE, 'conteudo', 1);
    expect(d.slides.map((s) => s.tipoId)).toEqual(['capa', 'conteudo', 'conteudo', 'cta']);
    moverSlide(d, 3, 0);
    expect(d.slides[0]!.tipoId).toBe('cta');
    (acharCamada(d, 1, 'titulo') as CamadaTexto).texto = 'Meu título';
    trocarTipo(d, LAYOUT_TESTE, 1, 'conteudo');
    expect((acharCamada(d, 1, 'titulo') as CamadaTexto).texto).toBe('Meu título');
    expect(ids(d.slides[1]!.camadas)).toContain('lista');
    while (d.slides.length > 1) excluirSlide(d, 0);
    expect(excluirSlide(d, 0)).toBe(false);
  });

  it('linha de luz: vira pontos sem mudar o desenho, arrasta, adiciona, remove e restaura', () => {
    const d = doc();
    restaurarLinhaSorteada(d, 'linha-luz'); // começa da linha sorteada pela semente
    garantirPontos(d, 'linha-luz', CTX);
    const linha = acharCamada(d, 'faixa', 'linha-luz') as CamadaForma;
    expect(linha.pontos!.length).toBeGreaterThan(3);
    moverPonto(d, 'linha-luz', 1, 1500, 300, CTX);
    expect(linha.pontos![1]).toEqual({ slide: 1, x: 420, y: 300 });
    const k = adicionarPonto(d, 'linha-luz', 2500, 200, CTX);
    expect(linha.pontos![k]).toEqual({ slide: 'ultimo', x: 340, y: 200 });
    const qtd = linha.pontos!.length;
    removerPonto(d, 'linha-luz', 0);
    expect(linha.pontos!.length).toBe(qtd - 1);
    // a linha editada continua sendo salva e montada
    const p = paraProjeto(projeto(), LAYOUT_TESTE, d);
    expect(montarSlides(LAYOUT_TESTE, p)).toHaveLength(3);
    restaurarLinhaSorteada(d, 'linha-luz');
    expect(linha.pontos).toBeUndefined();
  });
});
