/** "Prompt Bonito: Não Paga Boleto!" → "prompt-bonito-nao-paga-boleto" */
export function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'arquivo'
  );
}

/** Nome do arquivo de um slide: {projeto}-{NN}-{tipo}.{ext} */
export const nomeDoSlide = (projeto: string, indice: number, tipo: string, ext: string) =>
  `${slug(projeto)}-${String(indice + 1).padStart(2, '0')}-${slug(tipo)}.${ext}`;
