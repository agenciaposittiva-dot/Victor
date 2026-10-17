// Gera as imagens de teste da exportação (foto e avatar) com pngjs: arquivos pequenos, sem direitos de terceiros.
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

function gerar(w, h, cor, caminho) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const [r, g, b] = cor(x / w, y / h);
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  writeFileSync(caminho, PNG.sync.write(png));
}

// "foto": céu em degradê quente, sol e montanhas (tem bordas e detalhes para pegar diferença de pixels)
gerar(
  800,
  1000,
  (u, v) => {
    const sol = Math.hypot(u - 0.62, v - 0.36) < 0.13;
    const montanha = v > 0.62 + 0.08 * Math.sin(u * 9) + 0.05 * Math.sin(u * 23);
    const listra = Math.floor(u * 40) % 2 === 0 && v > 0.9;
    if (sol) return [255, 214, 140];
    if (listra) return [40, 30, 26];
    if (montanha) return [30 + 40 * (1 - v), 22 + 18 * u, 28];
    return [255 - 70 * v, 120 - 60 * v + 40 * u, 60 + 90 * v];
  },
  'public/teste/foto.png',
);

// avatar: círculo laranja com "VA" estilizado em blocos
gerar(
  160,
  160,
  (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    if (d > 0.5) return [10, 8, 6];
    const letra =
      (u > 0.28 && u < 0.36 && v > 0.32 && v < 0.68) ||
      (u > 0.44 && u < 0.52 && v > 0.32 && v < 0.68) ||
      (u > 0.6 && u < 0.72 && v > 0.32 && v < 0.68 && Math.abs(u - 0.66) < 0.06 * (1 - (v - 0.32)));
    return letra ? [255, 244, 236] : [255 - 40 * d, 90 + 40 * (1 - d), 31];
  },
  'public/teste/avatar.png',
);
console.log('ok: public/teste/foto.png e public/teste/avatar.png');
