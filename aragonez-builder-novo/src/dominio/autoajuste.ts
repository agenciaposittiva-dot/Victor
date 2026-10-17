/** Maior tamanho de fonte (entre min e max, em passos) para o qual o texto cabe na caixa.
 *  "cabe" é injetado: no navegador mede o DOM; nos testes é uma função falsa. */
export function ajustarTamanho({
  max,
  min,
  cabe,
  passo = 0.5,
}: {
  max: number;
  min: number;
  cabe: (tamanho: number) => boolean;
  passo?: number;
}): number {
  if (min >= max || cabe(max)) return max;
  let lo = Math.ceil(min / passo);
  let hi = Math.floor(max / passo);
  if (!cabe(lo * passo)) return min;
  // busca binária: lo sempre cabe, hi+1 nunca
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (cabe(meio * passo)) lo = meio;
    else hi = meio - 1;
  }
  return lo * passo;
}
