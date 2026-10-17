import { z } from 'zod';
import { Formato, Ponto } from './base';

export const ValorImagem = z.object({
  assetId: z.string().optional(),
  url: z.string().optional(),
  foco: Ponto.optional(),
  zoom: z.number().min(1).max(5).optional(),
});
export type ValorImagem = z.infer<typeof ValorImagem>;

/** Valor de um campo editável: texto ou imagem. */
export const ValorCampo = z.union([z.string(), ValorImagem]);
export type ValorCampo = z.infer<typeof ValorCampo>;

export const SlideDoProjeto = z.object({
  id: z.string().min(1),
  tipoId: z.string().min(1),
  conteudo: z.record(z.string(), ValorCampo).default({}),
  /** ajustes de design deste slide, por id de camada (ex.: mover um título). */
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});
export type SlideDoProjeto = z.infer<typeof SlideDoProjeto>;

export const Projeto = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  clienteId: z.string().optional(),
  layoutId: z.string().min(1),
  brandKitId: z.string().min(1),
  formato: Formato,
  slides: z.array(SlideDoProjeto).min(1),
  /** ajustes nas camadas da faixa contínua, por id. */
  faixaOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  legenda: z.object({ texto: z.string(), hashtags: z.array(z.string()), cta: z.string() }).optional(),
  miniaturaUrl: z.string().optional(),
  donoId: z.string().optional(),
  atualizadoEm: z.string().optional(),
});
export type Projeto = z.infer<typeof Projeto>;
export type ProjetoEntrada = z.input<typeof Projeto>;
