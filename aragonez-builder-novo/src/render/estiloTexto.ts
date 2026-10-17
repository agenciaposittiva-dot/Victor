import type { CSSProperties } from 'react';
import { parseDestaque, type Trecho } from '@/dominio/destaque';
import type { CamadaTexto } from '@/dominio/schemas';
import { resolverCor, resolverFonte, resolverTexto, type KitTokens } from '@/dominio/tokens';
import { familiaCss, type UsoDeFonte } from './fontes';

export type TextoResolvido = {
  trechos: Trecho[];
  base: CSSProperties;
  destaque: CSSProperties;
  usos: UsoDeFonte[];
};

/** Estilos do texto com os tokens resolvidos (o mesmo cálculo serve para desenhar e para medir). */
export function resolverTextoCamada(c: CamadaTexto, kit: KitTokens, tamanho: number): TextoResolvido {
  const fonte = resolverFonte(c.fonte, kit);
  const peso = c.peso ?? fonte.peso ?? 400;
  const italico = c.italico ?? fonte.italico ?? false;
  const fd = c.destaque?.fonte ? resolverFonte(c.destaque.fonte, kit) : null;
  const usos: UsoDeFonte[] = [{ familia: fonte.familia, peso, italico }];
  const contorno = c.contorno && c.contorno.largura > 0 ? c.contorno : null;
  const sombra = c.sombra;
  const base: CSSProperties = {
    fontFamily: familiaCss(fonte.familia),
    fontSize: tamanho,
    fontWeight: peso,
    fontStyle: italico ? 'italic' : 'normal',
    color: resolverCor(c.cor, kit) ?? '#000000',
    textAlign: c.alinhamento ?? 'left',
    lineHeight: c.entrelinha ?? 1.2,
    letterSpacing: c.espacamento ? `${c.espacamento}em` : undefined,
    textTransform: c.caixaAlta ? 'uppercase' : undefined,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    // contorno por fora da letra: o traço fica atrás do preenchimento
    ...(contorno && {
      WebkitTextStroke: `${contorno.largura * 2}px ${resolverCor(contorno.cor, kit)}`,
      paintOrder: 'stroke fill',
    }),
    ...(sombra && { textShadow: `${sombra.x}px ${sombra.y}px ${sombra.desfoque}px ${resolverCor(sombra.cor, kit)}` }),
  };
  const destaque: CSSProperties = {
    ...(fd && { fontFamily: familiaCss(fd.familia) }),
    ...(c.destaque?.peso !== undefined && { fontWeight: c.destaque.peso }),
    ...(c.destaque?.italico !== undefined && { fontStyle: c.destaque.italico ? 'italic' : 'normal' }),
    ...(c.destaque?.cor && { color: resolverCor(c.destaque.cor, kit) }),
  };
  if (c.destaque)
    usos.push({
      familia: fd?.familia ?? fonte.familia,
      peso: c.destaque.peso ?? (fd ? (fd.peso ?? 400) : peso),
      italico: c.destaque.italico ?? italico,
    });
  return { trechos: parseDestaque(resolverTexto(c.texto, kit)), base, destaque, usos };
}
