import type { CSSProperties } from 'react';
import type { Brilho, Fundo } from '@/dominio/schemas';
import { comOpacidade, resolverCor, type KitTokens } from '@/dominio/tokens';

/** Brilho (glow) feito com gradiente radial em várias paradas, sem filter: blur. Fica igual no preview e no arquivo. */
export function estiloBrilho(b: Brilho, kit: KitTokens): CSSProperties {
  const cor = resolverCor(b.cor, kit) ?? '#ff5a1f';
  const s = (b.suavidade ?? 1) * 100;
  const a = (k: number) => comOpacidade(cor, b.intensidade * k);
  return {
    position: 'absolute',
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    background: `radial-gradient(closest-side, ${a(1)} 0%, ${a(0.72)} ${s * 0.25}%, ${a(0.4)} ${s * 0.5}%, ${a(0.14)} ${s * 0.75}%, ${a(0)} ${s}%)`,
    pointerEvents: 'none',
  };
}

/** Cor de base do fundo (pintada por baixo na exportação em JPG, que não tem transparência). */
export function corDeBase(fundo: Fundo | undefined, kit: KitTokens): string {
  if (!fundo) return '#ffffff';
  if (fundo.tipo === 'cor') return resolverCor(fundo.cor, kit) ?? '#ffffff';
  if (fundo.tipo === 'brilhos') return resolverCor(fundo.base, kit) ?? '#000000';
  if (fundo.tipo === 'gradiente') return resolverCor(fundo.paradas[0]?.cor, kit) ?? '#ffffff';
  if (fundo.tipo === 'imagem') return resolverCor(fundo.cor, kit) ?? '#111111';
  return '#ffffff';
}
