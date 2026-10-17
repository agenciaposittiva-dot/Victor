import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Diferença máxima aceita entre o arquivo exportado e o render real do navegador (fração de pixels). */
const LIMITE = 0.01;

type Fonte = { familia: string; peso?: number; italico?: boolean; carregada: boolean };
type Conferencia = {
  arquivos: { nome: string; largura: number; altura: number; desvio: number; cores: number }[];
  bytes: number;
  ms: number;
  progresso: string[];
};
type Lab = {
  fontes: () => Fonte[];
  exportarPng: (op: { indices?: number[]; motor?: string; escala?: 1 | 2; estrategia?: string }) => Promise<string[]>;
  conferirZip: (op: { escala?: 1 | 2; motor?: string }) => Promise<Conferencia>;
};

const dePng = (buf: Buffer) => PNG.sync.read(buf);
const deDataUrl = (url: string) => dePng(Buffer.from(url.split(',')[1]!, 'base64'));
type Janela = { __lab: Lab };
const fontes = (page: Page) => page.evaluate(() => (window as unknown as Janela).__lab.fontes());
const exportarPng = (page: Page, op: Parameters<Lab['exportarPng']>[0]) =>
  page.evaluate((o) => (window as unknown as Janela).__lab.exportarPng(o), op);
const conferirZip = (page: Page, op: Parameters<Lab['conferirZip']>[0]) =>
  page.evaluate((o) => (window as unknown as Janela).__lab.conferirZip(o), op);

function diferenca(a: PNG, b: PNG): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  return pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.12 }) / (a.width * a.height);
}

async function abrirLab(page: Page, extra = '') {
  await page.goto(`/laboratorio?real=1&teste=1${extra}`);
  await page.waitForSelector('[data-fontes="prontas"]');
  await page.waitForFunction(() => !!(window as unknown as { __lab?: Lab }).__lab);
  await page.evaluate(() => document.fonts.ready);
}

/** Falha se alguma fonte usada não carregou: preview e arquivo cairiam na mesma fonte reserva e o teste de
 *  pixels passaria sem conferir nada. */
async function exigirFontes(page: Page) {
  const lista = await fontes(page);
  expect(lista.length).toBeGreaterThan(3);
  expect(
    lista.filter((f) => !f.carregada),
    'fontes que não carregaram',
  ).toEqual([]);
  // o "COMBO" usa Montserrat 900, que não está no kit: tem de aparecer e ter carregado
  expect(lista.some((f) => f.familia === 'Montserrat' && f.peso === 900)).toBe(true);
}

test('exportação fiel: cada slide exportado bate com o render real (modern-screenshot × html-to-image)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await abrirLab(page);
  await exigirFontes(page);
  const reais: PNG[] = [];
  for (const i of [0, 1, 2]) reais.push(dePng(await page.getByTestId(`real-${i}`).screenshot()));
  const resultado: Record<string, number[]> = {};
  for (const motor of ['modern-screenshot', 'html-to-image']) {
    const urls = await exportarPng(page, { motor, escala: 1 });
    resultado[motor] = urls.map((u, i) => Math.round(diferenca(deDataUrl(u), reais[i]!) * 10000) / 10000);
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/exportacao-fidelidade.json',
    JSON.stringify({ limite: LIMITE, diferencaPorSlide: resultado }, null, 2),
  );
  console.log('Diferença por slide (fração de pixels):', JSON.stringify(resultado));
  for (const d of resultado['modern-screenshot']!) expect(d).toBeLessThan(LIMITE);
});

test('carrossel contínuo: fatias exatas e iguais capturando slide a slide ou a faixa inteira', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirLab(page);
  const porSlide = (await exportarPng(page, { escala: 1 })).map(deDataUrl);
  const faixa = (await exportarPng(page, { escala: 1, estrategia: 'faixa' })).map(deDataUrl);
  expect(porSlide.map((p) => [p.width, p.height])).toEqual([
    [1080, 1350],
    [1080, 1350],
    [1080, 1350],
  ]);
  for (let i = 0; i < 3; i++) expect(diferenca(porSlide[i]!, faixa[i]!)).toBeLessThan(0.002);
  // a linha de luz e a bola atravessam a divisa: a última coluna do slide 1 continua na primeira do slide 2
  const coluna = (p: PNG, x: number) =>
    Array.from({ length: p.height }, (_, y) => p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));
  const distancia = (a: Uint8Array[], b: Uint8Array[]) =>
    a.reduce(
      (s, px, y) => s + Math.abs(px[0]! - b[y]![0]!) + Math.abs(px[1]! - b[y]![1]!) + Math.abs(px[2]! - b[y]![2]!),
      0,
    ) / a.length;
  expect(distancia(coluna(porSlide[0]!, 1079), coluna(porSlide[1]!, 0))).toBeLessThan(6);
});

test('escala 2× sai em 2160 × 2700', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirLab(page);
  const [s] = (await exportarPng(page, { indices: [0], escala: 2 })).map(deDataUrl);
  expect([s!.width, s!.height]).toEqual([2160, 2700]);
});

test('20 slides em 2× num ZIP: 20 arquivos de 2160×2700, todos com conteúdo, progresso até 20/20 e fontes carregadas', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await abrirLab(page, '&slides=20');
  await exigirFontes(page);
  const r = await conferirZip(page, { escala: 2 });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/exportacao-20-slides.json', JSON.stringify(r, null, 2));
  console.log(`ZIP 20 slides 2×: ${(r.bytes / 1e6).toFixed(1)} MB em ${(r.ms / 1000).toFixed(1)} s`);
  expect(r.arquivos).toHaveLength(20);
  r.arquivos.forEach((a, i) => {
    expect(a.nome).toMatch(
      new RegExp(`^prompt-bonito-nao-paga-boleto-${String(i + 1).padStart(2, '0')}-(capa|conteudo|cta)\\.jpg$`),
    );
    expect([a.largura, a.altura], a.nome).toEqual([2160, 2700]);
    // imagem em branco/preta tem desvio ~0 e 1 ou 2 cores
    expect(a.desvio, a.nome).toBeGreaterThan(12);
    expect(a.cores, a.nome).toBeGreaterThan(60);
  });
  expect(r.progresso.at(-1)).toBe('20/20');
  expect(r.progresso[0]).toBe('0/20');
  expect((await fontes(page)).filter((f) => !f.carregada)).toEqual([]);
});

test('downloads: ZIP padrão, JPG de vários slides vira ZIP, JPG de um slide, PDF com uma página por slide', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/laboratorio');
  await expect(page.getByRole('status').filter({ hasText: 'Pronto para exportar.' })).toBeVisible();
  const baixar = async (rotulo: string) => {
    const d = page.waitForEvent('download');
    await page.getByRole('button', { name: rotulo, exact: true }).click();
    const dl = await d;
    return { nome: dl.suggestedFilename(), dados: readFileSync(await dl.path()) };
  };
  const nomesNoZip = async (b: Buffer) => Object.keys((await JSZip.loadAsync(b)).files).sort();
  const esperado = [
    'prompt-bonito-nao-paga-boleto-01-capa',
    'prompt-bonito-nao-paga-boleto-02-conteudo',
    'prompt-bonito-nao-paga-boleto-03-cta',
  ];

  const zip = await baixar('ZIP');
  expect(zip.nome).toBe('prompt-bonito-nao-paga-boleto.zip');
  expect(await nomesNoZip(zip.dados)).toEqual(esperado.map((n) => n + '.jpg'));

  const jpgs = await baixar('JPG');
  expect(jpgs.nome).toBe('prompt-bonito-nao-paga-boleto-jpg.zip');
  expect(await nomesNoZip(jpgs.dados)).toEqual(esperado.map((n) => n + '.jpg'));

  const pngs = await baixar('PNG');
  expect(pngs.nome).toBe('prompt-bonito-nao-paga-boleto-png.zip');
  const primeiroPng = await (await JSZip.loadAsync(pngs.dados)).file(esperado[0] + '.png')!.async('nodebuffer');
  const p1 = dePng(primeiroPng);
  expect([p1.width, p1.height]).toEqual([1080, 1350]);

  const pdf = await baixar('PDF');
  expect(pdf.nome).toBe('prompt-bonito-nao-paga-boleto.pdf');
  const texto = pdf.dados.toString('latin1');
  expect(texto.startsWith('%PDF')).toBe(true);
  expect((texto.match(/\/Type \/Page\b/g) || []).length).toBe(3);

  await page.getByLabel('Slides').selectOption('primeiro');
  const um = await baixar('JPG');
  expect(um.nome).toBe('prompt-bonito-nao-paga-boleto-01-capa.jpg');
  expect(um.dados.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
});

test('progresso aparece na tela durante a exportação', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/laboratorio?slides=6');
  await expect(page.getByRole('status').filter({ hasText: 'Pronto para exportar.' })).toBeVisible();
  const visto = page
    .getByRole('status')
    .filter({ hasText: /Exportando \d+ de 6/ })
    .waitFor({ timeout: 60_000 });
  const d = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIP', exact: true }).click();
  await visto;
  await d;
});
