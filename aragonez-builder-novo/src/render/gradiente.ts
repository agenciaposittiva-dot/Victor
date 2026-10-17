/** Vetor de um linear-gradient do CSS numa caixa w×h: o centro da caixa, a direção (sen θ, −cos θ) e o
 *  comprimento |w·sen θ| + |h·cos θ|, para os cantos receberem as cores das pontas. Assim a forma SVG sai igual
 *  ao retângulo com background linear-gradient no mesmo ângulo. */
export function vetorDoGradiente(angulo: number, w: number, h: number) {
  const t = (angulo * Math.PI) / 180;
  const dx = Math.sin(t);
  const dy = -Math.cos(t);
  const meio = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return { x1: w / 2 - dx * meio, y1: h / 2 - dy * meio, x2: w / 2 + dx * meio, y2: h / 2 + dy * meio };
}
