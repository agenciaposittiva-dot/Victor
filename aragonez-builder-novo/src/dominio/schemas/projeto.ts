import { z } from 'zod';
import { Formato, Ponto } from './base';
import { Camada } from './camada';
import { Fundo } from './layout';

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
  /** ajustes de design deste slide, por id de camada (ex.: mover um título). Valor null apaga a propriedade do
   *  layout; { removida: true } tira a camada só deste slide. */
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  /** elementos que existem só neste slide (Modo Design), desenhados depois das camadas do layout. */
  camadasExtras: z.array(Camada).default([]),
  /** ordem das camadas (ids, de baixo para cima) quando o slide reordena camadas do layout e extras. */
  ordem: z.array(z.string()).optional(),
  /** fundo trocado só neste slide. */
  fundo: Fundo.optional(),
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
  /** ajustes nas camadas da faixa contínua, por id (mesmas regras dos overrides do slide). */
  faixaOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  /** camadas que atravessam os slides e existem só neste projeto. */
  faixaExtras: z.array(Camada).default([]),
  faixaOrdem: z.array(z.string()).optional(),
  /** guias do editor (px a partir do canto do slide), valem para todos os slides. */
  guias: z.object({ x: z.array(z.number()), y: z.array(z.number()) }).optional(),
  legenda: z.object({ texto: z.string(), hashtags: z.array(z.string()), cta: z.string() }).optional(),
  miniaturaUrl: z.string().optional(),
  donoId: z.string().optional(),
  atualizadoEm: z.string().optional(),
});
export type Projeto = z.infer<typeof Projeto>;
export type ProjetoEntrada = z.input<typeof Projeto>;
