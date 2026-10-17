import { expect, test } from '@playwright/test';

test('navega entre Dashboard, Biblioteca, Editor e Brand Kits', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('O que vamos criar hoje?');
  await expect(page.getByTestId('modo-dados')).toContainText('Modo local');
  for (const [link, titulo] of [
    ['Biblioteca', 'Layouts que vestem qualquer marca'],
    ['Editor', 'Editor visual'],
    ['Brand Kits', 'Um kit por cliente'],
    ['Dashboard', 'O que vamos criar hoje?'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(titulo);
  }
  // endereço direto (redirect de SPA) e página inexistente
  await page.goto('/kits');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Um kit por cliente');
  await page.goto('/xyz');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});

test('as fontes da marca carregam do próprio site', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('500 20px "Space Grotesk Variable"'));
  expect(ok).toBe(true);
});

test('no celular, o menu abre como gaveta e fecha ao navegar @celular', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Layouts que vestem qualquer marca');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
});
