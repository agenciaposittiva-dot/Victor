import type { UsoDeFonte } from '@/render/fontes';
import { avisar } from './toast';

/** Avisa na tela quando alguma fonte não carregou (o arquivo sai com a fonte reserva). */
export function avisarFontes(faltando: UsoDeFonte[]): void {
  if (!faltando.length) return;
  const lista = faltando.map((f) => `${f.familia} ${f.peso ?? 400}${f.italico ? ' itálico' : ''}`).join(', ');
  avisar(`A fonte ${lista} não carregou; o arquivo saiu com fonte substituta.`, 'erro');
}
