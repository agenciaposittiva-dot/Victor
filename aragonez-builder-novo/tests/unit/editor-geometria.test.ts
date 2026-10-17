import { describe, expect, it } from 'vitest';
import {
  alvosDosSlides,
  anguloAte,
  caixaDeContorno,
  encaixar,
  encaixarRedimensionamento,
  limiteDeEncaixe,
  redimensionar,
  type Caixa,
} from '@/editor/geometria';

/** Cantos de uma caixa girada, em coordenadas do documento. */
function cantos(c: Caixa) {
  const r = ((c.rotacao ?? 0) * Math.PI) / 180;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = (sx! * c.w) / 2;
    const ly = (sy! * c.h) / 2;
    return { x: cx + lx * Math.cos(r) - ly * Math.sin(r), y: cy + lx * Math.sin(r) + ly * Math.cos(r) };
  });
}

describe('geometria do editor', () => {
  it('redimensionar uma caixa girada 30° pelo canto mantém o canto oposto no mesmo lugar', () => {
    const ini: Caixa = { x: 100, y: 200, w: 300, h: 150, rotacao: 30 };
    const opostoAntes = cantos(ini)[0]!; // alça no canto inferior direito (hx 1, hy 1): o superior esquerdo fica
    const nova = redimensionar(ini, { hx: 1, hy: 1 }, 80, 40);
    const opostoDepois = cantos(nova)[0]!;
    expect(opostoDepois.x).toBeCloseTo(opostoAntes.x, 6);
    expect(opostoDepois.y).toBeCloseTo(opostoAntes.y, 6);
    expect(nova.rotacao).toBe(30);
    expect(nova.w).toBeGreaterThan(ini.w);
    // pela borda direita (hx 1, hy 0): a borda esquerda inteira continua no lugar
    const pelaBorda = redimensionar(ini, { hx: 1, hy: 0 }, 50, 0);
    expect(cantos(pelaBorda)[0]!.x).toBeCloseTo(cantos(ini)[0]!.x, 6);
    expect(cantos(pelaBorda)[3]!.y).toBeCloseTo(cantos(ini)[3]!.y, 6);
  });

  it('redimensionar com proporção e a partir do centro (Alt)', () => {
    const ini = { x: 0, y: 0, w: 200, h: 100 };
    const p = redimensionar(ini, { hx: 1, hy: 1 }, 100, 0, { proporcao: true });
    expect([p.w, p.h]).toEqual([300, 150]);
    const c = redimensionar(ini, { hx: 1, hy: 0 }, 20, 0, { centro: true });
    expect([c.x, c.w]).toEqual([-20, 240]);
  });

  it('encaixe em pixels de tela: 6 px viram 24 px do documento em 25% e 1,5 px em 400%', () => {
    expect(limiteDeEncaixe(0.25)).toBe(24);
    expect(limiteDeEncaixe(4)).toBe(1.5);
    const alvos = { x: [500], y: [] };
    const mov = { x: 470, y: 0, w: 10, h: 10 }; // borda direita (a mais perto) a 20 px do alvo
    expect(encaixar(mov, alvos, limiteDeEncaixe(0.25)).dx).toBe(20);
    expect(encaixar(mov, alvos, limiteDeEncaixe(4)).dx).toBe(0);
  });

  it('encaixa a borda arrastada ao redimensionar', () => {
    const r = encaixarRedimensionamento({ x: 100, y: 100, w: 395, h: 50 }, { hx: 1, hy: 0 }, { x: [500], y: [] }, 6);
    expect(r.caixa).toEqual({ x: 100, y: 100, w: 400, h: 50 });
    expect(r.linhasX).toEqual([500]);
    const esq = encaixarRedimensionamento({ x: 103, y: 100, w: 100, h: 50 }, { hx: -1, hy: 0 }, { x: [100], y: [] }, 6);
    expect(esq.caixa).toEqual({ x: 100, y: 100, w: 103, h: 50 });
  });

  it('alvos do carrossel contínuo: divisas entre slides, centros e margens de cada slide, guias', () => {
    const a = alvosDosSlides({
      n: 3,
      w: 1080,
      h: 1350,
      continuo: true,
      margem: { x: 72, y: 72 },
      guias: { x: [120], y: [887] },
    });
    for (const v of [0, 540, 1080, 1620, 2160, 2700, 3240, 72, 1152, 2232, 3168, 120, 1200, 2280])
      expect(a.x).toContain(v);
    for (const v of [0, 675, 1350, 72, 1278, 887]) expect(a.y).toContain(v);
    const um = alvosDosSlides({ n: 3, w: 1080, h: 1350, continuo: false });
    expect(um.x).toEqual([0, 540, 1080]);
  });

  it('contorno da caixa girada e ângulo da alça de girar (Shift = de 15 em 15)', () => {
    const r = caixaDeContorno({ x: 0, y: 0, w: 100, h: 100, rotacao: 45 });
    expect(r.w).toBeCloseTo(Math.SQRT2 * 100, 6);
    expect(anguloAte({ x: 0, y: 0, w: 100, h: 100 }, 50, -100)).toBe(0);
    expect(anguloAte({ x: 0, y: 0, w: 100, h: 100 }, 200, 50)).toBe(90);
    expect(anguloAte({ x: 0, y: 0, w: 100, h: 100 }, 200, 30, 15)).toBe(75);
  });
});
