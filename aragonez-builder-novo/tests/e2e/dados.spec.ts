import { expect, test, type Page } from '@playwright/test';

type Resumo = { conflitos: number; gravados: Record<string, number>; identicos: number; ilegiveis: string[] };
type Dados = {
  salvarProjetoComFoto: () => Promise<{ projetoId: string; arquivoId: string; foto: string }>;
  exportar: () => Promise<string>;
  importar: (b64: string) => Promise<Resumo>;
  lerProjeto: (id: string) => Promise<{ nome: string; slides: { conteudo: Record<string, unknown> }[] } | null>;
  lerArquivo: (id: string) => Promise<{ tipo: string; base64: string } | null>;
  prepararFotoGirada: (
    w: number,
    h: number,
  ) => Promise<{
    largura: number;
    altura: number;
    reduzida: boolean;
    saida: { w: number; h: number; topo: number[]; base: number[] };
  }>;
  prepararHeic: () => Promise<string>;
};
type Janela = { __dados: Dados };

async function abrir(page: Page) {
  await page.goto('/laboratorio?teste=1');
  await page.waitForFunction(() => !!(window as unknown as { __dados?: Dados }).__dados);
}
const chamar = <K extends keyof Dados>(page: Page, nome: K, ...args: Parameters<Dados[K]>) =>
  page.evaluate(
    ([n, a]) => ((window as unknown as Janela).__dados[n as K] as (...x: unknown[]) => unknown)(...(a as unknown[])),
    [nome, args] as const,
  ) as Promise<Awaited<ReturnType<Dados[K]>>>;

test('backup no navegador de verdade: exportar com foto, limpar os dados, importar e conferir', async ({ browser }) => {
  // navegador 1: cria o projeto com uma foto (Blob e IndexedDB reais) e exporta tudo
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await abrir(p1);
  const { projetoId, arquivoId, foto } = await chamar(p1, 'salvarProjetoComFoto');
  const zip = await chamar(p1, 'exportar');
  expect(zip.length).toBeGreaterThan(1000);
  await ctx1.close();

  // navegador 2: sem nenhum dado (equivale a limpar os dados do navegador)
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await abrir(p2);
  expect(await chamar(p2, 'lerProjeto', projetoId)).toBeNull();
  const resumo = await chamar(p2, 'importar', zip);
  expect(resumo).toMatchObject({ conflitos: 0, gravados: { projetos: 1, arquivos: 1 }, ilegiveis: [] });
  const projeto = await chamar(p2, 'lerProjeto', projetoId);
  expect(projeto?.nome).toBe('Projeto com foto');
  expect(projeto?.slides[0]!.conteudo).toEqual({ foto: { assetId: arquivoId } });
  const arquivo = await chamar(p2, 'lerArquivo', arquivoId);
  expect(arquivo).toEqual({ tipo: 'image/jpeg', base64: foto });
  // importar de novo o mesmo backup: nada a perguntar
  const deNovo = await chamar(p2, 'importar', zip);
  expect(deNovo).toMatchObject({ conflitos: 0, identicos: 1, gravados: { projetos: 0, arquivos: 0 } });
  await ctx2.close();
});

test('foto do celular com EXIF girado sai em pé; formato que não abre não é gravado', async ({ page }) => {
  await abrir(page);
  // pequena (fica o original, o navegador gira ao mostrar): 300×100 deitada → 100×300 em pé
  const pequena = await chamar(page, 'prepararFotoGirada', 300, 100);
  expect([pequena.largura, pequena.altura, pequena.reduzida]).toEqual([100, 300, false]);
  expect([pequena.saida.w, pequena.saida.h]).toEqual([100, 300]);
  // grande (reduzida para 2560 no lado maior e já gravada em pé): 3000×1000 → 853×2560
  const grande = await chamar(page, 'prepararFotoGirada', 3000, 1000);
  expect([grande.largura, grande.altura, grande.reduzida]).toEqual([853, 2560, true]);
  expect([grande.saida.w, grande.saida.h]).toEqual([853, 2560]);
  // girada 90° no sentido horário: a metade esquerda (vermelha) vai para cima, a direita (azul) para baixo
  expect(grande.saida.topo[0]).toBeGreaterThan(200);
  expect(grande.saida.topo[2]).toBeLessThan(60);
  expect(grande.saida.base[2]).toBeGreaterThan(200);
  expect(grande.saida.base[0]).toBeLessThan(60);
  // HEIC no Chrome: não abre, avisa e não grava
  expect(await chamar(page, 'prepararHeic')).toBe(
    'ImagemIlegivel: Este formato não abre neste navegador; envie em JPG ou PNG.',
  );
});
