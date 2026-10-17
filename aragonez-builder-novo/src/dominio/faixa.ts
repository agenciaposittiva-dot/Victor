import type { Camada } from './schemas';

/** Carrossel contínuo: os slides ficam lado a lado numa faixa de N × largura. */
export const larguraFaixa = (n: number, w: number) => n * w;

export type Fatia = { indice: number; sx: number; sy: number; sw: number; sh: number };

/** Recortes exatos da faixa renderizada em escala. Offsets inteiros e contíguos: a soma das larguras é a faixa
 *  inteira, sem 1px de sobra ou falta (cada fatia começa onde a anterior terminou). */
export function fatias(n: number, w: number, h: number, escala = 1): Fatia[] {
  const sh = Math.round(h * escala);
  return Array.from({ length: n }, (_, i) => {
    const sx = Math.round(i * w * escala);
    const fim = Math.round((i + 1) * w * escala);
    return { indice: i, sx, sy: 0, sw: fim - sx, sh };
  });
}

/** Posição real (na faixa) de uma camada de faixa, considerando âncora e "estica". */
export function posicaoNaFaixa<C extends Pick<Camada, 'x' | 'w' | 'ancora' | 'estica'>>(c: C, n: number, w: number): C {
  if (c.estica) return { ...c, x: 0, w: larguraFaixa(n, w) };
  if (c.ancora) {
    const idx = c.ancora.slide === 'ultimo' ? n - 1 : Math.min(c.ancora.slide, n - 1);
    return { ...c, x: idx * w + c.x };
  }
  return c;
}

/** Gerador pseudoaleatório determinístico (mesma semente, mesma linha em todo lugar). */
function aleatorio(semente: number) {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type ParamsLinha = {
  inicioX?: number;
  fimX?: number;
  yMin?: number;
  yMax?: number;
  semente?: number;
  pontosPorSlide?: number;
};

/** Caminho SVG da "linha de luz" que atravessa os slides. Começa no slide 1, ondula e termina no último,
 *  recalculado para qualquer quantidade de slides. Coordenadas na faixa inteira (0..N×w). */
export function caminhoLinhaDeLuz(n: number, w: number, h: number, p: ParamsLinha = {}): string {
  const inicio = p.inicioX ?? w * 0.8;
  const fim = p.fimX ?? (n - 1) * w + w * 0.07;
  const yMin = p.yMin ?? h * 0.17;
  const yMax = p.yMax ?? h * 0.82;
  const rnd = aleatorio(p.semente ?? 7);
  const qtd = Math.max(3, Math.round((n - 1) * (p.pontosPorSlide ?? 2)) + 1);
  const pts: [number, number][] = [];
  for (let i = 0; i < qtd; i++) {
    const t = i / (qtd - 1);
    const x = inicio + (fim - inicio) * t;
    // alterna alto/baixo com variação, para a linha "passear" pelos slides
    const onda = i % 2 === 0 ? 0.25 + rnd() * 0.25 : 0.55 + rnd() * 0.35;
    pts.push([x, yMin + (yMax - yMin) * onda]);
  }
  pts[0] = [inicio, yMin];
  // Catmull-Rom → Bézier cúbica (curva suave passando por todos os pontos)
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r(pts[0]![0])} ${r(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r(c1[0]!)} ${r(c1[1]!)} ${r(c2[0]!)} ${r(c2[1]!)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** Margem fixa para antisserrilhado e brilhos de borda. */
const MARGEM_BASE = 8;

/** Até onde uma camada pinta na horizontal, em coordenadas do slide: caixa girada + sombra + contorno. */
export function extensaoHorizontal(c: Camada): [number, number] {
  let ini = c.x;
  let fim = c.x + c.w;
  if (c.rotacao) {
    const r = (c.rotacao * Math.PI) / 180;
    const meia = (Math.abs(c.w * Math.cos(r)) + Math.abs(c.h * Math.sin(r))) / 2;
    const cx = c.x + c.w / 2;
    ini = cx - meia;
    fim = cx + meia;
  }
  let margem = MARGEM_BASE;
  if ('sombra' in c && c.sombra) margem += Math.abs(c.sombra.x) + c.sombra.desfoque;
  if ('contorno' in c && c.contorno) margem += c.contorno.largura;
  if (c.tipo === 'forma' && c.forma === 'linhaDeLuz') margem += (c.parametros?.espessura ?? 3) * 6;
  ini -= margem;
  fim += margem;
  if (c.tipo === 'grupo') {
    // filhos são relativos ao grupo e podem passar da caixa dele (cada filho já traz a própria margem)
    for (const f of c.filhos) {
      const [a, b] = extensaoHorizontal(f);
      ini = Math.min(ini, c.x + a);
      fim = Math.max(fim, c.x + b);
    }
  }
  return [ini, fim];
}

/** Slides que precisam ser desenhados para a janela do slide "indice" sair completa: o próprio slide e todo slide
 *  que tenha alguma camada cuja área (com o deslocamento do slide na faixa) cruze a janela. No caso comum são
 *  os vizinhos; um elemento que atravessa mais de um slide continua aparecendo inteiro. */
export function slidesVisiveis(camadasPorSlide: Camada[][], indice: number, w: number): number[] {
  const janelaIni = indice * w;
  const janelaFim = (indice + 1) * w;
  const r: number[] = [];
  camadasPorSlide.forEach((camadas, j) => {
    if (j === indice) return void r.push(j);
    const cruza = camadas.some((c) => {
      if (c.oculta) return false;
      const [a, b] = extensaoHorizontal(c);
      return j * w + b > janelaIni && j * w + a < janelaFim;
    });
    if (cruza) r.push(j);
  });
  return r;
}
