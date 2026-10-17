import type { CSSProperties } from 'react';
import { ajustarTamanho } from '@/dominio/autoajuste';
import type { Trecho } from '@/dominio/destaque';

/** Mede texto num nó escondido com os mesmos estilos do render. O cache evita medir de novo a cada render. */
let medidor: HTMLDivElement | null = null;
const cache = new Map<string, number>();
const LIMITE_CACHE = 4000;

/** Contadores para os testes (quantas buscas de tamanho rodaram de verdade, fora do cache). */
export const estatisticasDaMedida = { buscas: 0, acertos: 0 };

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

/** O que muda a medida da fonte: família, peso, estilo, entrelinha, espaçamento, caixa alta e contorno (do texto e
 *  do trecho em destaque). Cor, alinhamento e sombra não mudam o tamanho e ficam de fora. */
function chaveDaFonte(b: CSSProperties, d: CSSProperties): string {
  return [
    b.fontFamily,
    b.fontWeight,
    b.fontStyle,
    b.lineHeight,
    b.letterSpacing,
    b.textTransform,
    b.WebkitTextStroke,
    d.fontFamily,
    d.fontWeight,
    d.fontStyle,
    d.letterSpacing,
  ].join('|');
}

/** Chave explícita do cache: (texto, fonte, w, h, limites, versão das fontes). Editar um texto só invalida o dele;
 *  os outros continuam no cache e não são medidos de novo a cada tecla. */
export function chaveDaMedida(a: {
  trechos: Trecho[];
  base: CSSProperties;
  destaque: CSSProperties;
  w: number;
  h: number;
  max: number;
  min: number;
  versaoFontes: number;
}): string {
  const texto = a.trechos.map((t) => (t.destaque ? '\u0002' + t.texto + '\u0003' : t.texto)).join('');
  return [texto, chaveDaFonte(a.base, a.destaque), a.w, a.h, a.max, a.min, a.versaoFontes].join('\u0001');
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
  const chave = chaveDaMedida(args);
  const salvo = cache.get(chave);
  if (salvo !== undefined) {
    // usado de novo: vai para o fim da fila (o cache descarta primeiro o que ficou mais tempo sem uso)
    cache.delete(chave);
    cache.set(chave, salvo);
    estatisticasDaMedida.acertos++;
    return salvo;
  }
  estatisticasDaMedida.buscas++;
  const t = ajustarTamanho({
    max: args.max,
    min: args.min,
    cabe: (tam) => cabeNaCaixa(args.trechos, args.base, args.destaque, args.w, args.h, tam),
  });
  if (cache.size >= LIMITE_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(chave, t);
  return t;
}
