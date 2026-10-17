import { pontoNaFaixaParaSlide } from './faixa';
import type { PontoDaLinha } from './schemas';

/** Leitura de caminhos SVG (atributo d) para transformar um vetor exportado do Figma em pontos de controle da
 *  linha de luz. Aceita M L H V C S Q T Z, absolutos e relativos (arcos A viram reta até o ponto final). */
type P = [number, number];
type Seg = { de: P; ate: P; ctrl: P[] };

const RE_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;

export function lerCaminho(d: string): Seg[][] {
  const tokens = [...d.matchAll(RE_TOKEN)].map((m) => m[1] ?? Number(m[2]));
  const sub: Seg[][] = [];
  let atual: Seg[] = [];
  let p: P = [0, 0];
  let inicio: P = [0, 0];
  let ultimoCtrl: P | null = null;
  let cmd = '';
  let i = 0;
  const num = () => tokens[i++] as number;
  const temNumero = () => typeof tokens[i] === 'number';
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++] as string;
    else if (!cmd) throw new Error('Caminho SVG inválido: falta o comando inicial.');
    const rel = cmd === cmd.toLowerCase();
    const ab = (x: number, y: number): P => (rel ? [p[0] + x, p[1] + y] : [x, y]);
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      if (p[0] !== inicio[0] || p[1] !== inicio[1]) atual.push({ de: p, ate: inicio, ctrl: [] });
      p = inicio;
      ultimoCtrl = null;
      if (!temNumero()) continue;
    }
    if (!temNumero()) continue;
    if (C === 'M') {
      if (atual.length) sub.push(atual);
      atual = [];
      p = ab(num(), num());
      inicio = p;
      cmd = rel ? 'l' : 'L'; // pares seguintes do M são retas
      ultimoCtrl = null;
    } else if (C === 'L') {
      const q = ab(num(), num());
      atual.push({ de: p, ate: q, ctrl: [] });
      p = q;
      ultimoCtrl = null;
    } else if (C === 'H') {
      const x = num();
      const q: P = [rel ? p[0] + x : x, p[1]];
      atual.push({ de: p, ate: q, ctrl: [] });
      p = q;
      ultimoCtrl = null;
    } else if (C === 'V') {
      const y = num();
      const q: P = [p[0], rel ? p[1] + y : y];
      atual.push({ de: p, ate: q, ctrl: [] });
      p = q;
      ultimoCtrl = null;
    } else if (C === 'C' || C === 'S') {
      const c1: P =
        C === 'C' ? ab(num(), num()) : ultimoCtrl ? [2 * p[0] - ultimoCtrl[0], 2 * p[1] - ultimoCtrl[1]] : p;
      const c2 = ab(num(), num());
      const q = ab(num(), num());
      atual.push({ de: p, ate: q, ctrl: [c1, c2] });
      p = q;
      ultimoCtrl = c2;
    } else if (C === 'Q' || C === 'T') {
      const c: P = C === 'Q' ? ab(num(), num()) : ultimoCtrl ? [2 * p[0] - ultimoCtrl[0], 2 * p[1] - ultimoCtrl[1]] : p;
      const q = ab(num(), num());
      atual.push({ de: p, ate: q, ctrl: [c] });
      p = q;
      ultimoCtrl = c;
    } else if (C === 'A') {
      i += 5;
      const q = ab(num(), num());
      atual.push({ de: p, ate: q, ctrl: [] });
      p = q;
      ultimoCtrl = null;
    }
  }
  if (atual.length) sub.push(atual);
  return sub;
}

/** Ponto do segmento em t (0..1). */
function pontoEm(s: Seg, t: number): P {
  const u = 1 - t;
  if (s.ctrl.length === 2) {
    const [a, b] = s.ctrl as [P, P];
    return [
      u * u * u * s.de[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * s.ate[0],
      u * u * u * s.de[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * s.ate[1],
    ];
  }
  if (s.ctrl.length === 1) {
    const c = s.ctrl[0] as P;
    return [
      u * u * s.de[0] + 2 * u * t * c[0] + t * t * s.ate[0],
      u * u * s.de[1] + 2 * u * t * c[1] + t * t * s.ate[1],
    ];
  }
  return [s.de[0] + (s.ate[0] - s.de[0]) * t, s.de[1] + (s.ate[1] - s.de[1]) * t];
}

/** Pontos bem próximos ao longo do caminho (para medir distância e amostrar). */
export function pontosDensos(d: string, porSegmento = 64): P[] {
  const r: P[] = [];
  for (const sub of lerCaminho(d))
    sub.forEach((s, k) => {
      for (let j = k === 0 ? 0 : 1; j <= porSegmento; j++) r.push(pontoEm(s, j / porSegmento));
    });
  return r;
}

/** Amostra o caminho em pontos a cada "passo" px de comprimento, sempre incluindo o começo e o fim. */
export function amostrarCaminho(d: string, passo = 60): P[] {
  const densos = pontosDensos(d);
  if (densos.length < 2) return densos;
  const r: P[] = [densos[0]!];
  let acumulado = 0;
  for (let i = 1; i < densos.length; i++) {
    const a = densos[i - 1]!;
    const b = densos[i]!;
    acumulado += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acumulado >= passo) {
      r.push(b);
      acumulado = 0;
    }
  }
  const fim = densos.at(-1)!;
  const ult = r.at(-1)!;
  if (Math.hypot(fim[0] - ult[0], fim[1] - ult[1]) < passo * 0.35) r[r.length - 1] = fim;
  else r.push(fim);
  return r;
}

/** Transforma um vetor (ex.: a "Linha contínua" do Figma, vetor 14:53) em pontos de controle da linha de luz.
 *  - d: caminho do vetor, em coordenadas do próprio vetor (viewBox);
 *  - caixa: onde o vetor fica na faixa (x, y em px da faixa; w, h em px); viewBox: tamanho original do vetor;
 *  - n e w: quantidade de slides do carrossel de origem e largura do slide (para prender cada ponto ao seu slide).
 *  A linha resultante passa a acompanhar carrosséis maiores ou menores (os pontos do último slide viram 'ultimo'). */
export function pontosDoCaminho(
  d: string,
  op: {
    caixa: { x: number; y: number; w: number; h: number };
    viewBox?: { w: number; h: number };
    n: number;
    w: number;
    passo?: number;
  },
): PontoDaLinha[] {
  const vb = op.viewBox ?? { w: op.caixa.w, h: op.caixa.h };
  const sx = op.caixa.w / vb.w;
  const sy = op.caixa.h / vb.h;
  return amostrarCaminho(d, (op.passo ?? 60) / Math.max(sx, sy)).map(([x, y]) =>
    pontoNaFaixaParaSlide(op.caixa.x + x * sx, op.caixa.y + y * sy, op.n, op.w),
  );
}
