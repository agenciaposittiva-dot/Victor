import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ANGULOS = [0, 45, 90, 135, 180];

test('gradiente: forma SVG sai igual ao retângulo com linear-gradient em 0°, 45°, 90°, 135° e 180°', async ({
  page,
}) => {
  await page.goto('/laboratorio?gradientes=1');
  const resultado: Record<number, number> = {};
  for (const a of ANGULOS) {
    const css = PNG.sync.read(await page.getByTestId(`grad-css-${a}`).screenshot());
    const svg = PNG.sync.read(await page.getByTestId(`grad-svg-${a}`).screenshot());
    expect([svg.width, svg.height]).toEqual([css.width, css.height]);
    const px = pixelmatch(css.data, svg.data, undefined, css.width, css.height, { threshold: 0.05 });
    resultado[a] = px / (css.width * css.height);
  }
  console.log('Gradiente CSS × SVG (fração de pixels diferentes):', JSON.stringify(resultado));
  for (const a of ANGULOS) expect(resultado[a], `${a}°`).toBeLessThan(0.002);
});
