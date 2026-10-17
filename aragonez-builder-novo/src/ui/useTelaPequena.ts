import { useSyncExternalStore } from 'react';

/** Corte do celular, num número só: o CSS usa o mesmo valor em todo @media de celular (max-width: 860px), e o
 *  teste tests/unit/cortes.test.ts confere todos os .css de src. */
export const CORTE_CELULAR = 860;
export const TELA_PEQUENA = `(max-width: ${CORTE_CELULAR}px)`;

/** true em tela de celular. Acompanha a rotação do aparelho (o matchMedia avisa quando a largura cruza o corte). */
export function useTelaPequena(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof matchMedia !== 'function') return () => {};
      const m = matchMedia(TELA_PEQUENA);
      m.addEventListener?.('change', avisar);
      return () => m.removeEventListener?.('change', avisar);
    },
    () => typeof matchMedia === 'function' && matchMedia(TELA_PEQUENA).matches,
    () => false,
  );
}
