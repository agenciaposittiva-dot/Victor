import { z } from 'zod';
import { RE_COR } from './base';

export const Fonte = z.object({
  familia: z.string().min(1),
  peso: z.number().int().min(100).max(900).optional(),
  italico: z.boolean().optional(),
  origem: z.enum(['google', 'local', 'upload']).default('local'),
  /** arquivo enviado (TTF/OTF/WOFF2) quando origem = upload. */
  arquivoId: z.string().optional(),
});
export type Fonte = z.infer<typeof Fonte>;

export const Asset = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.enum(['logo', 'pattern', 'textura', 'selo', 'foto', 'fonte', 'icone']),
  variacao: z.enum(['clara', 'escura', 'icone']).optional(),
  url: z.string().min(1),
  w: z.number().optional(),
  h: z.number().optional(),
});
export type Asset = z.infer<typeof Asset>;

const corHex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Use uma cor em hex, ex.: #FF5A1F');

export const BrandKit = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  clienteId: z.string().optional(),
  donoId: z.string().optional(),
  /** tokens nomeados: primaria, secundaria, fundo, texto, destaque… */
  cores: z.record(z.string().regex(/^[\w-]+$/, 'Nome de cor: letras, números, - ou _'), corHex),
  fontes: z.object({ titulo: Fonte, corpo: Fonte, destaque: Fonte.optional(), etiqueta: Fonte.optional() }),
  logos: z.array(Asset).default([]),
  assets: z.array(Asset).default([]),
  handle: z.string().optional(),
  tomDeVoz: z.string().optional(),
  layoutPadraoId: z.string().optional(),
  /** versão do formato salvo (migrações em src/dados/migracao.ts, como projetos e layouts). */
  versaoSchema: z.literal(1).default(1),
  atualizadoEm: z.string().optional(),
});
export type BrandKit = z.infer<typeof BrandKit>;
export type BrandKitEntrada = z.input<typeof BrandKit>;

export { RE_COR };
