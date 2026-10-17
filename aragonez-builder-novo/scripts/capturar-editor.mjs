// Capturas do editor para conferência visual (item 63): computador (1440×900) e celular (390×844), em
// docs/amostras/editor/. Cada captura junta os erros do console (tem que ficar vazio) em capturas.json.
// Uso: npm run capturas:editor (faz o build antes). Usa o layout e o kit de teste (ferramentas de desenvolvimento).
/* global window, document -- usados nas funções que rodam dentro da página (page.evaluate) */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PORTA = 4180;
const BASE = `http://127.0.0.1:${PORTA}`;
const PASTA = fileURLToPath(new URL('../docs/amostras/editor/', import.meta.url));

const APARELHOS = {
  computador: { viewport: { width: 1440, height: 900 } },
  celular: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
};

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function esperarServidor() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await esperar(200);
  }
  throw new Error('O vite preview não respondeu');
}

const chamar = (page, nome, ...args) => page.evaluate(([n, a]) => window.__dados[n](...a), [nome, args]);
async function ganchos(page) {
  await page.waitForFunction(() => !!window.__dados);
}
async function novoProjeto(page, op = {}) {
  await page.goto(`${BASE}/editor?teste=1`);
  await ganchos(page);
  return chamar(page, 'criarProjetoDeTeste', op);
}
async function abrirEditor(page, id) {
  await page.goto(`${BASE}/editor/${id}?teste=1`);
  await page.getByTestId('editor').waitFor();
  await ganchos(page);
  await estabilizar(page);
}
/** Fontes e imagens prontas, e um respiro para o enquadramento e as miniaturas. */
async function estabilizar(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((i) =>
        i.complete ? null : new Promise((ok) => i.addEventListener('load', ok, { once: true })),
      ),
    );
  });
  await page.waitForTimeout(500);
}
const titulo = (page) => page.getByLabel('Título', { exact: true });

/** As capturas, na ordem. "so" limita a um aparelho. */
const CAPTURAS = [
  {
    nome: 'editor-continuo',
    descricao: 'Editor no Modo Conteúdo com o layout contínuo de teste (faixa desenhada uma vez só).',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page));
    },
  },
  {
    nome: 'campo-selecionado',
    descricao: 'Campo "Título" focado no painel: a camada fica marcada no canvas.',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page));
      await titulo(page).click();
      await estabilizar(page);
    },
  },
  {
    nome: 'edicao-no-canvas',
    descricao:
      'Computador: dois cliques no título abrem a edição direto no canvas. Celular: o toque duplo leva ao campo do painel (com o canvas fixo no topo).',
    async fazer(page, aparelho) {
      await abrirEditor(page, await novoProjeto(page));
      const caixa = await page.locator('[data-testid="canvas"] [data-slide="0"] [data-camada="titulo"]').boundingBox();
      const x = caixa.x + caixa.width / 2;
      const y = caixa.y + Math.min(caixa.height / 2, 40);
      if (aparelho === 'celular') {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      } else await page.mouse.dblclick(x, y);
      await estabilizar(page);
    },
  },
  {
    nome: 'foto-enviada',
    descricao: 'Foto enviada pelo campo "Foto" (reduzida e guardada só pelo assetId), com zoom e enquadramento.',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page));
      await chamar(page, 'enviarFotoNoCampo', { w: 1600, h: 1200, formato: 'jpeg', paisagem: true });
      await page.locator('[data-testid="canvas"] [data-slide="0"] [data-camada="foto"] img[src^="blob:"]').waitFor();
      await estabilizar(page);
    },
  },
  {
    nome: 'layout-nao-continuo',
    descricao:
      'Layout comum (sem faixa contínua): o canvas mostra só o slide ativo e a faixa de slides, as miniaturas.',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page, { solto: true }));
    },
  },
  {
    nome: 'aviso-conflito',
    descricao: 'Outra aba salvou o projeto antes: aviso fixo com as três escolhas (nada é salvo por cima).',
    async fazer(page) {
      const id = await novoProjeto(page);
      await abrirEditor(page, id);
      await titulo(page).fill('Mudança desta aba');
      await chamar(page, 'salvarComoOutraAba', id);
      await page.getByTestId('aviso-conflito').waitFor();
      await page.evaluate(() => document.activeElement?.blur());
      await estabilizar(page);
    },
  },
  {
    nome: 'aviso-kit-ausente',
    descricao: 'Projeto com um Brand Kit que não existe neste navegador: aviso fixo e exportação bloqueada.',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page, { semKit: true }));
      await page.getByTestId('aviso-kit').waitFor();
    },
  },
  {
    nome: 'aviso-armazenamento-cheio',
    descricao: 'Armazenamento do navegador cheio (QuotaExceededError): aviso fixo com Exportar tudo e Tentar de novo.',
    async fazer(page) {
      const id = await novoProjeto(page);
      await abrirEditor(page, id);
      await chamar(page, 'simularArmazenamentoCheio');
      await titulo(page).fill('Não cabe mais');
      await page.getByTestId('aviso-erro-salvar').waitFor();
      await page.evaluate(() => document.activeElement?.blur());
      await estabilizar(page);
    },
  },
  {
    nome: 'lista-de-projetos',
    descricao: 'Lista de projetos com miniaturas reais e o quadro de backup do modo local.',
    async fazer(page) {
      await novoProjeto(page, { nome: 'Carrossel contínuo' });
      await chamar(page, 'criarProjetoDeTeste', { nome: 'Post sem faixa', solto: true });
      await chamar(page, 'criarProjetoDeTeste', { nome: 'Só a capa', tipos: ['capa'] });
      await page.goto(`${BASE}/editor?teste=1`);
      await page.getByText('Só a capa').waitFor();
      await estabilizar(page);
    },
  },
  {
    nome: 'novo-projeto',
    descricao: 'Diálogo "Novo projeto": layout, Brand Kit e nome.',
    async fazer(page) {
      await novoProjeto(page, { nome: 'Projeto existente' });
      await page.goto(`${BASE}/editor?teste=1`);
      await page.getByRole('button', { name: 'Novo projeto' }).first().click();
      await page.getByRole('dialog', { name: 'Novo projeto' }).waitFor();
      await estabilizar(page);
    },
  },
  {
    nome: 'celular-campos',
    so: 'celular',
    descricao: 'Celular rolado até os campos: o painel fica embaixo do slide.',
    async fazer(page) {
      await abrirEditor(page, await novoProjeto(page));
      await page.locator('[aria-label="Campos do slide"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await estabilizar(page);
    },
  },
  {
    nome: 'celular-dois-avisos',
    so: 'celular',
    descricao:
      'Celular com dois avisos (salvo em outra aba e kit ausente): só o mais urgente fica aberto e a linha "+1 aviso" diz qual é o outro.',
    async fazer(page) {
      const id = await novoProjeto(page, { semKit: true });
      await abrirEditor(page, id);
      // outra aba (outra página do mesmo navegador) salva o projeto: esta recebe o aviso pelo BroadcastChannel
      const outra = await page.context().newPage();
      await outra.goto(`${BASE}/editor?teste=1`);
      await ganchos(outra);
      await chamar(outra, 'salvarComoOutraAba', id);
      await outra.close();
      await page.getByTestId('mais-avisos').waitFor();
      await estabilizar(page);
    },
  },
];

rmSync(PASTA, { recursive: true, force: true });
mkdirSync(PASTA, { recursive: true });
const servidor = spawn('npx', ['vite', 'preview', '--port', String(PORTA), '--strictPort', '--host', '127.0.0.1'], {
  stdio: 'ignore',
});
const relatorio = [];
let comErro = 0;
try {
  await esperarServidor();
  const navegador = await chromium.launch();
  for (const [aparelho, opcoes] of Object.entries(APARELHOS)) {
    let n = 0;
    for (const c of CAPTURAS) {
      if (c.so && c.so !== aparelho) continue;
      n++;
      const contexto = await navegador.newContext({ ...opcoes, locale: 'pt-BR' });
      await contexto.addInitScript(() => localStorage.setItem('aragonez:dev', '1'));
      const page = await contexto.newPage();
      const erros = [];
      page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
      page.on('pageerror', (e) => erros.push(e.message));
      const arquivo = `${aparelho}-${String(n).padStart(2, '0')}-${c.nome}.jpg`;
      try {
        await c.fazer(page, aparelho);
        await page.screenshot({ path: PASTA + arquivo, type: 'jpeg', quality: 86 });
      } catch (e) {
        erros.push(`a captura falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
      await contexto.close();
      relatorio.push({ arquivo, aparelho, descricao: c.descricao, errosDoConsole: erros });
      comErro += erros.length ? 1 : 0;
      console.log(`${erros.length ? '✗' : '✓'} ${arquivo}${erros.length ? `\n    ${erros.join('\n    ')}` : ''}`);
    }
  }
  await navegador.close();
} finally {
  servidor.kill();
}
writeFileSync(PASTA + 'capturas.json', JSON.stringify(relatorio, null, 2) + '\n');
console.log(`\n${relatorio.length} capturas em docs/amostras/editor/; com erro no console: ${comErro}.`);
process.exitCode = comErro ? 1 : 0;
