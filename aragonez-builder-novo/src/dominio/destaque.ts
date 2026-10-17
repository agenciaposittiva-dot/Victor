/** Destaque inline: *palavras entre asteriscos* recebem o estilo "destaque" da camada
 *  (ex.: serif itálico laranja no meio de um título sans light). \* escreve um asterisco literal. */
export type Trecho = { texto: string; destaque: boolean };

const ESC = '\u0000';

export function parseDestaque(texto: string): Trecho[] {
  const t = texto.replace(/\\\*/g, ESC);
  const trechos: Trecho[] = [];
  const re = /\*([^*]+)\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  const empurrar = (s: string, destaque: boolean) => {
    if (!s) return;
    const s2 = s.replace(new RegExp(ESC, 'g'), '*');
    const ant = trechos[trechos.length - 1];
    if (ant && ant.destaque === destaque) ant.texto += s2;
    else trechos.push({ texto: s2, destaque });
  };
  while ((m = re.exec(t))) {
    empurrar(t.slice(ultimo, m.index), false);
    empurrar(m[1] as string, true);
    ultimo = m.index + m[0].length;
  }
  empurrar(t.slice(ultimo), false);
  return trechos;
}

/** Texto sem as marcações de destaque (para contar caracteres, mandar para a IA, nomear arquivos). */
export const semDestaque = (texto: string) =>
  parseDestaque(texto)
    .map((t) => t.texto)
    .join('');
