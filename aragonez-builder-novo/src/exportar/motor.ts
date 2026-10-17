import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/** Bibliotecas de captura comparadas na Fase 2 (resultado em docs/EXPORTACAO.md). */
export type Motor = 'modern-screenshot' | 'html-to-image';
export const MOTOR_PADRAO: Motor = 'modern-screenshot';

const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Cada render fora da tela tem um prefixo próprio no useId: os ids dos gradientes SVG não colidem com os da tela. */
let rendersFora = 0;

/** Espera todas as imagens do nó carregarem e decodificarem (sem isso a imagem sai em branco no arquivo). */
export async function esperarImagens(no: HTMLElement): Promise<void> {
  const imgs = [...no.querySelectorAll('img')];
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.complete)
        await new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        });
      await img.decode().catch(() => undefined);
    }),
  );
}

/** Desenha um elemento fora da tela, em tamanho real, e devolve o nó pronto para capturar. */
export async function renderizarFora(
  el: ReactElement,
  w: number,
  h: number,
): Promise<{ no: HTMLElement; desmontar: () => void }> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:${-(w + 200)}px;top:0;width:${w}px;height:${h}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);
  const raiz = createRoot(host, { identifierPrefix: `exp${++rendersFora}-` });
  flushSync(() => raiz.render(el));
  await esperarImagens(host);
  await document.fonts.ready;
  await quadro();
  await quadro();
  const no = host.firstElementChild as HTMLElement;
  return {
    no,
    desmontar: () => {
      raiz.unmount();
      host.remove();
    },
  };
}

/** Captura um nó (já em tamanho real) num canvas de w×h × escala. */
export async function capturar(
  no: HTMLElement,
  op: { w: number; h: number; escala: number; motor?: Motor; fundo?: string },
): Promise<HTMLCanvasElement> {
  const motor = op.motor ?? MOTOR_PADRAO;
  if (motor === 'html-to-image') {
    const { toCanvas } = await import('html-to-image');
    return toCanvas(no, {
      width: op.w,
      height: op.h,
      pixelRatio: op.escala,
      canvasWidth: op.w,
      canvasHeight: op.h,
      backgroundColor: op.fundo,
      cacheBust: false,
      skipAutoScale: true,
    });
  }
  const { domToCanvas } = await import('modern-screenshot');
  return domToCanvas(no, { width: op.w, height: op.h, scale: op.escala, backgroundColor: op.fundo ?? null });
}

/** Copia uma área do canvas para um canvas novo (fatia de faixa contínua). */
export function recortar(origem: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  c.getContext('2d')!.drawImage(origem, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}
