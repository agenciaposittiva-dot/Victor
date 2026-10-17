import type { CSSProperties } from 'react';
import { ajustarTamanho } from '@/dominio/autoajuste';
import type { Trecho } from '@/dominio/destaque';

/** Mede texto num nó escondido com os mesmos estilos do render. O cache evita medir de novo a cada render. */
let medidor: HTMLDivElement | null = null;
const cache = new Map<string, number>();

function aplicar(el: HTMLElement, estilo: CSSProperties) {
  for (const [k, v] of Object.entries(estilo)) {
    if (v === undefined) continue;
    const prop = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^webkit-/, '-webkit-');
    el.style.setProperty(
      prop,
      typeof v === 'number' && !['font-weight', 'line-height', 'opacity'].includes(prop) ? `${v}px` : String(v),
    );
  }
}

function cabeNaCaixa(
  trechos: Trecho[],
  base: CSSProperties,
  destaque: CSSProperties,
  w: number,
  h: number,
  tamanho: number,
): boolean {
  if (!medidor) {
    medidor = document.createElement('div');
    medidor.setAttribute('aria-hidden', 'true');
    medidor.style.cssText =
      'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
    document.body.appendChild(medidor);
  }
  medidor.replaceChildren();
  medidor.removeAttribute('style');
  medidor.style.cssText = `position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;width:${w}px;`;
  aplicar(medidor, { ...base, fontSize: tamanho });
  for (const t of trechos) {
    if (t.destaque) {
      const s = document.createElement('span');
      aplicar(s, destaque);
      s.textContent = t.texto;
      medidor.appendChild(s);
    } else medidor.appendChild(document.createTextNode(t.texto));
  }
  return medidor.scrollHeight <= h + 0.5 && medidor.scrollWidth <= w + 0.5;
}

/** Maior tamanho (entre min e max) em que o texto cabe na caixa w×h. */
export function tamanhoQueCabe(args: {
  trechos: Trecho[];
  base: CSSProperties;
  destaque: CSSProperties;
  w: number;
  h: number;
  max: number;
  min: number;
  versaoFontes: number;
}): number {
  if (typeof document === 'undefined') return args.max;
  const chave = JSON.stringify([
    args.trechos,
    args.base,
    args.destaque,
    args.w,
    args.h,
    args.max,
    args.min,
    args.versaoFontes,
  ]);
  const salvo = cache.get(chave);
  if (salvo !== undefined) return salvo;
  const t = ajustarTamanho({
    max: args.max,
    min: args.min,
    cabe: (tam) => cabeNaCaixa(args.trechos, args.base, args.destaque, args.w, args.h, tam),
  });
  if (cache.size > 2000) cache.clear();
  cache.set(chave, t);
  return t;
}
