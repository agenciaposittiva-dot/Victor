import { z } from 'zod';

/** Cor: hex (#rgb, #rrggbb, #rrggbbaa), token do Brand Kit ({cores.primaria} ou {cores.primaria}/40 com opacidade)
 *  ou 'transparent'. */
export const RE_COR = /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|\{cores\.[\w-]+\}(\/\d{1,3})?|transparent)$/i;
export const Cor = z.string().regex(RE_COR, 'Cor inválida: use #rrggbb ou um token como {cores.primaria}');

/** Fonte de uma camada: nome da família ("Space Grotesk") ou token ({fontes.titulo}). */
export const RefFonte = z.string().min(1);

export const Ponto = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type Ponto = z.infer<typeof Ponto>;

export const Sombra = z.object({ x: z.number(), y: z.number(), desfoque: z.number().min(0), cor: Cor });
export type Sombra = z.infer<typeof Sombra>;

export const Borda = z.object({ cor: Cor, largura: z.number().min(0) });
export type Borda = z.infer<typeof Borda>;

export const Gradiente = z.object({
  tipo: z.literal('gradiente'),
  angulo: z.number(),
  paradas: z.array(z.object({ cor: Cor, pos: z.number().min(0).max(1) })).min(2),
});
export type Gradiente = z.infer<typeof Gradiente>;

/** Preenchimento de forma: cor sólida (string) ou gradiente linear. */
export const Preenchimento = z.union([Cor, Gradiente]);
export type Preenchimento = z.infer<typeof Preenchimento>;

export const Formato = z.object({ w: z.number().int().min(100).max(4000), h: z.number().int().min(100).max(4000) });
export type Formato = z.infer<typeof Formato>;

export const FORMATOS = {
  retrato: { w: 1080, h: 1350 },
  quadrado: { w: 1080, h: 1080 },
  stories: { w: 1080, h: 1920 },
} as const satisfies Record<string, Formato>;
