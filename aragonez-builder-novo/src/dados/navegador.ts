/** WebKit com a regra de apagar dados do site depois de uns 7 dias sem abrir (ITP): o Safari do Mac e qualquer
 *  navegador do iPhone e do iPad (no iOS, Chrome, Firefox e Edge também usam o WebKit: CriOS, FxiOS, EdgiOS). */
export function apagaDadosSemUso(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  toques = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): boolean {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && toques > 1); // iPadOS se apresenta como Mac
  const safariDoMac = /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg\/|Firefox|OPR\//i.test(ua);
  return ios || safariDoMac;
}
