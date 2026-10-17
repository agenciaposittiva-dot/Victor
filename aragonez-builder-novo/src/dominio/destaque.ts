/** Destaque inline: *palavras entre asteriscos* recebem o estilo "destaque" da camada
 *  (ex.: serif itálico laranja no meio de um título sans light). \* escreve um asterisco literal.
 *  Regras para não destacar por engano asteriscos de oferta e de conta:
 *  - o * de abertura não pode vir colado depois de letra ou número ("R$ 9,99*", "5*5*5");
 *  - logo depois do * de abertura e logo antes do de fechamento vem um caractere que não é espaço ("2 * 3 * 4");
 *  - o * de fechamento não pode vir colado antes de letra ou número ("*promo*ção");
 *  - o trecho destacado não atravessa quebra de linha. */
export type Trecho = { texto: string; destaque: boolean };

const ESC = '\u0000';
/** Trecho entre asteriscos, sem asterisco nem quebra de linha dentro, que começa e termina sem espaço. */
const RE_DESTAQUE = /\*(?=\S)([^*\n]*[^*\s])\*/g;
/** Termina em letra ou número? (olha os 2 últimos códigos para não partir letras fora do plano básico) */
const RE_COLADO = /[\p{L}\p{N}]$/u;
/** Começa com letra ou número? */
const RE_COLADO_DEPOIS = /^[\p{L}\p{N}]/u;

export function parseDestaque(texto: string): Trecho[] {
  const t = texto.replace(/\\\*/g, ESC);
  const trechos: Trecho[] = [];
  const re = new RegExp(RE_DESTAQUE);
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
    const fim = m.index + m[0].length;
    if (RE_COLADO.test(t.slice(Math.max(0, m.index - 2), m.index)) || RE_COLADO_DEPOIS.test(t.slice(fim, fim + 2))) {
      // asterisco colado em letra ou número não abre (nem fecha) destaque: tenta a partir do próximo caractere
      re.lastIndex = m.index + 1;
      continue;
    }
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
