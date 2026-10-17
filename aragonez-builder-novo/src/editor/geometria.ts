/** Geometria do canvas do editor: caixas (com rotação), união, encaixe (snapping), redimensionar e girar. */
export type Caixa = { x: number; y: number; w: number; h: number; rotacao?: number };
export type Retangulo = { x: number; y: number; w: number; h: number };

export const centro = (c: Retangulo) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

/** Retângulo alinhado aos eixos que contém a caixa girada. */
export function caixaDeContorno(c: Caixa): Retangulo {
  if (!c.rotacao) return { x: c.x, y: c.y, w: c.w, h: c.h };
  const r = (c.rotacao * Math.PI) / 180;
  const w = Math.abs(c.w * Math.cos(r)) + Math.abs(c.h * Math.sin(r));
  const h = Math.abs(c.w * Math.sin(r)) + Math.abs(c.h * Math.cos(r));
  const m = centro(c);
  return { x: m.x - w / 2, y: m.y - h / 2, w, h };
}

export function uniao(cs: Caixa[]): Retangulo {
  const rs = cs.map(caixaDeContorno);
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export const cruza = (a: Retangulo, b: Retangulo) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export type Alvos = { x: number[]; y: number[] };
export type Encaixe = { dx: number; dy: number; linhasX: number[]; linhasY: number[] };

/** Distância de encaixe em pixels de TELA (6 px), convertida para o documento pelo zoom: em 25% pega de longe o
 *  bastante, em 400% não "puxa" de longe. */
export const DISTANCIA_DE_ENCAIXE = 6;
export const limiteDeEncaixe = (zoom: number) => DISTANCIA_DE_ENCAIXE / Math.max(zoom, 0.01);

function melhorEncaixe(pontos: number[], alvosEixo: number[], limite: number) {
  let d = Infinity;
  for (const p of pontos) for (const a of alvosEixo) if (Math.abs(a - p) < Math.abs(d)) d = a - p;
  if (Math.abs(d) > limite) return { d: 0, linhas: [] as number[] };
  const linhas = new Set<number>();
  for (const p of pontos) for (const a of alvosEixo) if (Math.abs(a - (p + d)) < 0.01) linhas.add(a);
  return { d, linhas: [...linhas] };
}

/** Ajuste que encosta a caixa em movimento (bordas e centro) no alvo mais próximo, até "limite" px do documento
 *  (use limiteDeEncaixe(zoom)). */
export function encaixar(mov: Retangulo, alvos: Alvos, limite: number): Encaixe {
  const ex = melhorEncaixe([mov.x, mov.x + mov.w / 2, mov.x + mov.w], alvos.x, limite);
  const ey = melhorEncaixe([mov.y, mov.y + mov.h / 2, mov.y + mov.h], alvos.y, limite);
  return { dx: ex.d, dy: ey.d, linhasX: ex.linhas, linhasY: ey.linhas };
}

/** Encaixe ao redimensionar (caixa sem rotação): só a borda que está sendo arrastada encosta nos alvos. */
export function encaixarRedimensionamento(
  c: Retangulo,
  alca: Alca,
  alvos: Alvos,
  limite: number,
): { caixa: Retangulo; linhasX: number[]; linhasY: number[] } {
  let { x, y, w, h } = c;
  let linhasX: number[] = [];
  let linhasY: number[] = [];
  if (alca.hx) {
    const borda = alca.hx < 0 ? x : x + w;
    const e = melhorEncaixe([borda], alvos.x, limite);
    if (e.d) {
      if (alca.hx < 0) {
        x += e.d;
        w -= e.d;
      } else w += e.d;
      linhasX = e.linhas;
    }
  }
  if (alca.hy) {
    const borda = alca.hy < 0 ? y : y + h;
    const e = melhorEncaixe([borda], alvos.y, limite);
    if (e.d) {
      if (alca.hy < 0) {
        y += e.d;
        h -= e.d;
      } else h += e.d;
      linhasY = e.linhas;
    }
  }
  return { caixa: { x, y, w: Math.max(1, w), h: Math.max(1, h) }, linhasX, linhasY };
}

/** Bordas e centros de caixas, como alvos de encaixe. */
export function alvosDe(caixas: Retangulo[], extra: Partial<Alvos> = {}): Alvos {
  const x: number[] = [...(extra.x ?? [])];
  const y: number[] = [...(extra.y ?? [])];
  for (const c of caixas) {
    x.push(c.x, c.x + c.w / 2, c.x + c.w);
    y.push(c.y, c.y + c.h / 2, c.y + c.h);
  }
  return { x, y };
}

/** Alvos dos slides: bordas e centro de cada slide (no contínuo, as divisas entre slides são múltiplos da largura),
 *  as margens seguras e as guias do usuário (guias valem em todo slide). */
export function alvosDosSlides(op: {
  n: number;
  w: number;
  h: number;
  continuo: boolean;
  margem?: { x: number; y: number };
  guias?: Alvos;
}): Alvos {
  const qtd = op.continuo ? op.n : 1;
  const x: number[] = [];
  const y: number[] = [0, op.h / 2, op.h];
  if (op.margem) y.push(op.margem.y, op.h - op.margem.y);
  for (const gy of op.guias?.y ?? []) y.push(gy);
  for (let i = 0; i < qtd; i++) {
    const o = i * op.w;
    x.push(o, o + op.w / 2, o + op.w);
    if (op.margem) x.push(o + op.margem.x, o + op.w - op.margem.x);
    for (const gx of op.guias?.x ?? []) x.push(o + gx);
  }
  return { x: [...new Set(x)], y: [...new Set(y)] };
}

const rodar = (x: number, y: number, rad: number) => ({
  x: x * Math.cos(rad) - y * Math.sin(rad),
  y: x * Math.sin(rad) + y * Math.cos(rad),
});

export type Alca = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 };
export const ALCAS: Alca[] = [
  { hx: -1, hy: -1 },
  { hx: 0, hy: -1 },
  { hx: 1, hy: -1 },
  { hx: 1, hy: 0 },
  { hx: 1, hy: 1 },
  { hx: 0, hy: 1 },
  { hx: -1, hy: 1 },
  { hx: -1, hy: 0 },
];

/** Redimensiona pela alça (hx, hy) com o ponteiro deslocado (dx, dy) em px do documento. A conta é feita no eixo
 *  da própria caixa (vale para caixa girada) e o lado oposto à alça fica parado. proporcao: mantém a proporção;
 *  centro (Alt): cresce para os dois lados a partir do centro. */
export function redimensionar(
  ini: Caixa,
  alca: Alca,
  dx: number,
  dy: number,
  op: { proporcao?: boolean; centro?: boolean; minimo?: number } = {},
): Caixa {
  const rad = ((ini.rotacao ?? 0) * Math.PI) / 180;
  const local = rodar(dx, dy, -rad);
  const fator = op.centro ? 2 : 1;
  let w = alca.hx ? ini.w + alca.hx * local.x * fator : ini.w;
  let h = alca.hy ? ini.h + alca.hy * local.y * fator : ini.h;
  if (op.proporcao && ini.w > 0 && ini.h > 0) {
    const razao = ini.w / ini.h;
    if (alca.hx && alca.hy) {
      // canto: vale o eixo que mais mudou
      if (Math.abs(w / ini.w - 1) > Math.abs(h / ini.h - 1)) h = w / razao;
      else w = h * razao;
    } else if (alca.hx) h = w / razao;
    else w = h * razao;
  }
  const min = op.minimo ?? 1;
  w = Math.max(min, w);
  h = Math.max(min, h);
  const c0 = centro(ini);
  let c = c0;
  if (!op.centro) {
    // o ponto oposto à alça (no eixo da caixa) não sai do lugar
    const ancoraIni = rodar((-alca.hx * ini.w) / 2, (-alca.hy * ini.h) / 2, rad);
    const ancoraDoc = { x: c0.x + ancoraIni.x, y: c0.y + ancoraIni.y };
    const ancoraNova = rodar((-alca.hx * w) / 2, (-alca.hy * h) / 2, rad);
    // em proporção pela borda, o outro eixo cresce para os dois lados (como no Figma)
    c = { x: ancoraDoc.x - ancoraNova.x, y: ancoraDoc.y - ancoraNova.y };
  }
  return { x: c.x - w / 2, y: c.y - h / 2, w, h, ...(ini.rotacao ? { rotacao: ini.rotacao } : {}) };
}

/** Ângulo (graus) da alça de girar: do centro da caixa até o ponteiro, com 0° apontando para cima.
 *  passo (Shift): arredonda de 15 em 15. */
export function anguloAte(c: Retangulo, px: number, py: number, passo?: number): number {
  const m = centro(c);
  let a = (Math.atan2(py - m.y, px - m.x) * 180) / Math.PI + 90;
  if (passo) a = Math.round(a / passo) * passo;
  a = ((a % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 10) / 10;
}

/** Arredonda posições e tamanhos a 0,1 px (o arquivo salvo fica limpo e o desenho não muda). */
export const arred = (v: number) => Math.round(v * 10) / 10;
