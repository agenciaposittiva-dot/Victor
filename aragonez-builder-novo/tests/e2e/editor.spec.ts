import { expect, test, type Page } from '@playwright/test';

/** Editor no navegador de verdade (Chromium): o que os testes de unidade só simulam no jsdom (showModal, foco,
 *  teclado, ponteiros, imagens, IndexedDB, exportação). Projetos de teste e medições pelos ganchos (?teste=1). */

type Dados = Record<string, (...args: unknown[]) => Promise<unknown>>;
type Ganchos = { __dados: Dados };

test.beforeEach(async ({ context }) => {
  // o layout e o kit de teste só aparecem com as ferramentas de desenvolvimento ligadas (item T5 do PENDENCIAS)
  await context.addInitScript(() => localStorage.setItem('aragonez:dev', '1'));
});

async function esperarGanchos(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as Partial<Ganchos>).__dados);
}
function chamar<T>(page: Page, nome: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([n, a]) => (window as unknown as Ganchos).__dados[n as string]!(...(a as unknown[])), [
    nome,
    args,
  ] as const) as Promise<T>;
}
async function novoProjeto(page: Page, op: Record<string, unknown> = {}): Promise<string> {
  await page.goto('/editor?teste=1');
  await esperarGanchos(page);
  return chamar<string>(page, 'criarProjetoDeTeste', op);
}
async function abrirEditor(page: Page, id: string) {
  await page.goto(`/editor/${id}?teste=1`);
  await expect(page.getByTestId('editor')).toBeVisible();
  await esperarGanchos(page);
}
/** Deslocamento da vista (translate do "mundo" do canvas). */
async function vista(page: Page) {
  return page.getByTestId('canvas').evaluate((area) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      (area.firstElementChild as HTMLElement).style.transform,
    )!;
    return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
  });
}
/** Distância entre o centro do slide ativo e o centro da área do canvas. */
async function foraDoCentro(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('[data-testid="canvas"]')!.getBoundingClientRect();
    const slide = document.querySelector('[data-testid="canvas"] [class*="slideAtivo"]')?.getBoundingClientRect();
    if (!slide) return null;
    return {
      x: Math.round(Math.abs(slide.x + slide.width / 2 - (area.x + area.width / 2))),
      y: Math.round(Math.abs(slide.y + slide.height / 2 - (area.y + area.height / 2))),
    };
  });
}

test.describe('avisos, kit e exportação', () => {
  test('exportar mostra o toast; banco atualizado em outra aba mostra o aviso fixo', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    const baixou = page.waitForEvent('download');
    await page.getByTestId('exportar').click();
    // a foto de exemplo do layout entra como lembrete antes de exportar
    const dialogo = page.getByRole('dialog', { name: 'Lembrete antes de exportar' });
    await expect(dialogo).toContainText('Foto, slide 1 ainda é a foto de exemplo do layout');
    await dialogo.getByTestId('exportar-mesmo-assim').click();
    expect((await baixou).suggestedFilename()).toMatch(/\.zip$/);
    await expect(page.getByRole('status').filter({ hasText: 'pronto.' })).toBeVisible();
    // outra aba abre uma versão nova do banco: esta aba fecha a conexão, para de salvar e avisa
    await page.evaluate(
      () =>
        new Promise<void>((ok, falha) => {
          const r = indexedDB.open('aragonez-builder', 2);
          r.onsuccess = () => {
            r.result.close();
            ok();
          };
          r.onerror = () => falha(r.error);
        }),
    );
    await expect(page.getByTestId('aviso-banco')).toContainText('O armazenamento foi atualizado em outra aba');
  });

  test('kit ausente: aviso fixo e Exportar desabilitado; escolher um kit libera', async ({ page }) => {
    const id = await novoProjeto(page, { semKit: true });
    await abrirEditor(page, id);
    await expect(page.getByTestId('aviso-kit')).toBeVisible();
    await expect(page.getByTestId('exportar')).toBeDisabled();
    await page.getByRole('button', { name: 'Escolher um kit' }).click();
    await page.getByLabel('Brand Kit').selectOption('kit-teste');
    await page.getByRole('button', { name: 'Usar este kit' }).click();
    await expect(page.getByTestId('aviso-kit')).toBeHidden();
    await expect(page.getByTestId('exportar')).toBeEnabled();
  });

  test('computador: Exportar baixa o ZIP, sem botão de compartilhar', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    const baixou = page.waitForEvent('download');
    await page.getByTestId('exportar').click();
    await page.getByRole('dialog').getByTestId('exportar-mesmo-assim').click();
    expect((await baixou).suggestedFilename()).toBe('projeto-de-teste.zip');
    await expect(page.getByTestId('compartilhar')).toHaveCount(0);
  });

  test('no celular, aparece "Salvar nas Fotos / Compartilhar"; editar depois de exportar faz o botão sumir @celular', async ({
    page,
  }) => {
    // o Chromium do Linux não tem a Web Share API (o Android e o iPhone têm): só ela é trocada por uma versão que
    // aceita arquivos; o resto do caminho (toque, exportação, segundo toque) é o de verdade
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (d?: { files?: File[] }) => !!d?.files?.length,
      });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => undefined });
    });
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await page.getByTestId('exportar').click();
    await page.getByRole('dialog').getByTestId('exportar-mesmo-assim').click();
    const compartilhar = page.getByTestId('compartilhar');
    await expect(compartilhar).toHaveText('Salvar nas Fotos / Compartilhar', { timeout: 30_000 });
    await page.getByLabel('Título', { exact: true }).fill('Mudou depois de exportar');
    await expect(compartilhar).toHaveCount(0);
  });
});

test.describe('celular e enquadramento', () => {
  test('campos com pelo menos 16 px e botões com pelo menos 44 px @celular', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await expect(page.getByLabel('Título', { exact: true })).toBeVisible();
    const problemas = await page.evaluate(() => {
      const visivel = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
      };
      const nome = (el: Element) =>
        el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title') || el.tagName;
      const campos = [...document.querySelectorAll('input, textarea, select')]
        .filter(visivel)
        .filter((el) => !['range', 'checkbox', 'radio', 'file', 'hidden'].includes((el as HTMLInputElement).type))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${nome(el)}: ${getComputedStyle(el).fontSize}`);
      const botoes = [...document.querySelectorAll('button')]
        .filter(visivel)
        .map((b) => ({ b, r: b.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ b, r }) => `${nome(b)}: ${Math.round(r.width)}×${Math.round(r.height)}`);
      return { campos, botoes };
    });
    expect(problemas).toEqual({ campos: [], botoes: [] });
  });

  for (const [w, h] of [
    [1440, 900],
    [1280, 720],
  ] as const)
    test(`ao abrir, o slide ativo fica centrado (${w}×${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const id = await novoProjeto(page);
      await abrirEditor(page, id);
      await expect.poll(() => foraDoCentro(page)).toEqual({ x: expect.any(Number), y: expect.any(Number) });
      const d = (await foraDoCentro(page))!;
      expect(d.x).toBeLessThanOrEqual(2);
      expect(d.y).toBeLessThanOrEqual(2);
    });

  test('ao abrir, o slide ativo fica centrado no celular @celular', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await expect.poll(() => foraDoCentro(page)).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    const d = (await foraDoCentro(page))!;
    expect(d.x).toBeLessThanOrEqual(2);
    expect(d.y).toBeLessThanOrEqual(2);
  });

  test('pinça com dois dedos no canvas dá zoom normal, não em dobro @celular', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    const caixa = (await page.getByTestId('canvas').boundingBox())!;
    const cx = caixa.x + caixa.width / 2;
    const cy = caixa.y + caixa.height / 2;
    const antes = (await vista(page)).zoom;
    const cdp = await page.context().newCDPSession(page);
    const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', pontos: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: pontos.map(([x, y], i) => ({ x, y, id: i + 1 })),
      });
    // os dedos começam a 100 px um do outro e terminam a 200 px: o dobro da distância, o dobro do zoom
    await toque('touchStart', [
      [cx - 50, cy],
      [cx + 50, cy],
    ]);
    for (let k = 1; k <= 10; k++) {
      const d = 50 + (50 * k) / 10;
      await toque('touchMove', [
        [cx - d, cy],
        [cx + d, cy],
      ]);
    }
    await toque('touchEnd', []);
    const depois = (await vista(page)).zoom;
    expect(depois / antes).toBeCloseTo(2, 1);
  });
});

test.describe('teclado, diálogo e menu', () => {
  test('diálogo de exportar: o foco começa em "Voltar e corrigir", Enter não exporta e o item leva ao campo', async ({
    page,
  }) => {
    const id = await novoProjeto(page, { tipos: ['capa', 'conteudo', 'capa'], fotoVazia: [2] });
    await abrirEditor(page, id);
    let baixou = false;
    page.on('download', () => void (baixou = true));
    await page.getByTestId('exportar').click();
    const dialogo = page.getByRole('dialog', { name: 'Exportar mesmo assim?' });
    await expect(dialogo).toContainText('Foto, slide 3 está vazia');
    await expect(page.locator(':focus')).toHaveText('Voltar e corrigir');
    await page.keyboard.press('Enter');
    await expect(dialogo).toBeHidden();
    await page.waitForTimeout(500);
    expect(baixou).toBe(false);

    await page.getByTestId('exportar').click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Foto, slide 3 está vazia/ })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Slide 3: Capa' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator(':focus')).toHaveAttribute('id', 'campo-2-foto');
    expect(baixou).toBe(false);
  });

  test('Tab até Exportar e espaço aciona o botão; com o foco fora dos controles, espaço + arrastar move a vista', async ({
    page,
  }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    for (let i = 0; i < 40; i++) {
      if ((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'exportar') break;
      await page.keyboard.press('Tab');
    }
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', 'exportar');
    await page.keyboard.press('Space');
    const dialogo = page.getByRole('dialog', { name: 'Lembrete antes de exportar' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Voltar e trocar' }).click();

    // espaço + arrastar começando em cima do título: sem o espaço, isso escolheria o campo
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const titulo = (await page
      .locator('[data-testid="canvas"] [data-slide="0"] [data-camada="titulo"]')
      .boundingBox())!;
    const x = titulo.x + titulo.width / 2;
    const y = titulo.y + titulo.height / 2;
    const antes = await vista(page);
    await page.keyboard.down('Space');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 60, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const depois = await vista(page);
    expect(Math.round(depois.x - antes.x)).toBe(120);
    expect(Math.round(depois.y - antes.y)).toBe(60);
    await expect(page.locator('#campo-0-titulo')).not.toBeFocused();
  });

  test('menu "+ Slide": abre com o foco no primeiro tipo, fecha com Esc e com clique fora', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    const botao = page.getByRole('button', { name: 'Slide', exact: true });
    await botao.click();
    const menu = page.getByRole('menu', { name: 'Tipo do slide novo' });
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(botao).toBeFocused();
    await botao.click();
    await expect(menu).toBeVisible();
    await page.getByTestId('canvas').click({ position: { x: 24, y: 24 } });
    await expect(menu).toBeHidden();
  });
});

test.describe('fotos', () => {
  type Arquivo = { assetId: string; tipo: string; w: number; h: number; cantoDireito: number[] };
  const imagemDaFoto = (page: Page) => page.locator('[data-testid="canvas"] [data-slide="0"] [data-camada="foto"] img');
  const tamanhoNoEditor = (page: Page) =>
    imagemDaFoto(page).evaluate((i: HTMLImageElement) =>
      i.complete && i.naturalWidth > 0 ? [i.naturalWidth, i.naturalHeight] : null,
    );
  /** A parte de cima da foto no JPG exportado (os dois lados) é vermelha: a foto saiu em pé. Deitada, o lado direito
   *  seria azul. */
  async function emPeNoArquivo(page: Page, id: string) {
    const { pontos } = await chamar<{ pontos: number[][] }>(page, 'pixelsDoSlide', id, 0, [
      [650, 140],
      [950, 140],
    ]);
    for (const [r, , b] of pontos) {
      expect(r).toBeGreaterThan(170);
      expect(b).toBeLessThan(100);
    }
  }

  test('JPEG pequeno e grande com EXIF de rotação saem em pé no editor e no JPG exportado', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    // pequena (300×100 deitada no arquivo, EXIF 6): fica o original e aparece em pé (100×300)
    await chamar(page, 'enviarFotoNoCampo', { w: 300, h: 100, formato: 'jpeg', exif6: true });
    await expect.poll(() => tamanhoNoEditor(page)).toEqual([100, 300]);
    await expect.poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id)).toMatchObject({ w: 100, h: 300 });
    await emPeNoArquivo(page, id);
    // grande (3000×1000 com EXIF 6): reduzida para 2560 no lado maior e gravada em pé (853×2560)
    await chamar(page, 'enviarFotoNoCampo', { w: 3000, h: 1000, formato: 'jpeg', exif6: true });
    await expect.poll(() => tamanhoNoEditor(page)).toEqual([853, 2560]);
    await expect
      .poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id))
      .toMatchObject({ tipo: 'image/jpeg', w: 853, h: 2560 });
    await emPeNoArquivo(page, id);
  });

  test('fotos de 6000×4000 e 8064×6048 são reduzidas para 2560 no lado maior', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await chamar(page, 'enviarFotoNoCampo', { w: 6000, h: 4000, formato: 'jpeg' });
    await expect
      .poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id), { timeout: 30_000 })
      .toMatchObject({ w: 2560, h: 1707 });
    await chamar(page, 'enviarFotoNoCampo', { w: 8064, h: 6048, formato: 'jpeg' });
    await expect
      .poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id), { timeout: 30_000 })
      .toMatchObject({ w: 2560, h: 1920 });
  });

  test('WebP com transparência continua transparente (PNG); WebP sem transparência vira JPEG', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await chamar(page, 'enviarFotoNoCampo', { w: 3000, h: 2000, formato: 'webp', alfa: true });
    await expect
      .poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id))
      .toMatchObject({ tipo: 'image/png', w: 2560, h: 1707 });
    const comAlfa = (await chamar<Arquivo>(page, 'arquivoDaFoto', id))!;
    expect(comAlfa.cantoDireito[3]).toBe(0); // a metade direita era transparente
    await chamar(page, 'enviarFotoNoCampo', { w: 3000, h: 2000, formato: 'webp' });
    await expect
      .poll(() => chamar<Arquivo | null>(page, 'arquivoDaFoto', id))
      .toMatchObject({ tipo: 'image/jpeg', w: 2560, h: 1707 });
  });

  test('HEIC é recusado com aviso e nada é gravado', async ({ page }) => {
    const id = await novoProjeto(page);
    await abrirEditor(page, id);
    await chamar(page, 'enviarFotoNoCampo', { w: 0, h: 0, formato: 'heic' });
    await expect(page.getByRole('alert')).toContainText('Este formato não abre neste navegador; envie em JPG ou PNG.');
    await page.waitForTimeout(800);
    expect(await chamar(page, 'arquivoDaFoto', id)).toBeNull();
  });

  test('campo de foto vazio: a pergunta aparece antes de exportar e o JPG sai sem o texto "Imagem"', async ({
    page,
  }) => {
    const id = await novoProjeto(page, { fotoVazia: [0] });
    await abrirEditor(page, id);
    // no editor, o campo vazio mostra o texto de espera
    await expect(page.locator('[data-testid="canvas"] [data-slide="0"] [data-camada="foto"]')).toContainText('Imagem');
    await page.getByTestId('exportar').click();
    const dialogo = page.getByRole('dialog', { name: 'Exportar mesmo assim?' });
    await expect(dialogo).toContainText('Foto, slide 1 está vazia');
    await dialogo.getByRole('button', { name: 'Voltar e corrigir' }).click();
    // no arquivo, o slide com o campo vazio é idêntico ao slide sem a camada: nenhum pixel de texto ou de listra
    expect(await chamar<number>(page, 'compararCampoVazio', id, 0)).toBe(0);
  });
});

test.describe('última barreira da exportação', () => {
  test('SVG só com viewBox não conta como erro; src quebrado conta, com a camada e o arquivo', async ({ page }) => {
    await page.goto('/editor?teste=1');
    await esperarGanchos(page);
    expect(await chamar(page, 'testarEsperarImagens')).toEqual({
      carregando: [{ camada: 'foto', asset: 'a-quebrado' }],
      prontas: [{ camada: 'foto', asset: 'a-quebrado' }],
    });
  });

  test('exportando direto pelo gerarArquivos: arquivo que não abre e arquivo apagado entram com o campo; SVG válido não', async ({
    page,
  }) => {
    await page.goto('/editor?teste=1');
    await esperarGanchos(page);
    expect(await chamar(page, 'exportarComArquivosRuins')).toEqual([
      { campo: 'Foto', slides: [0] },
      { campo: 'Selo', slides: [0] },
    ]);
  });
});
