import { z } from 'zod';
import { Borda, Cor, Ponto, Preenchimento, RefFonte, Sombra } from './base';

/** Campos comuns a toda camada. Posições e tamanhos em px na base do formato (1080 de largura). */
const base = {
  id: z.string().min(1),
  nome: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().min(0),
  h: z.number().min(0),
  rotacao: z.number().optional(),
  opacidade: z.number().min(0).max(1).optional(),
  oculta: z.boolean().optional(),
  travada: z.boolean().optional(),
  /** editavel = vira campo no painel de conteúdo (Modo Conteúdo). */
  editavel: z.boolean().optional(),
  /** nome do campo para o usuário ("Título", "Nome do prato"). */
  rotulo: z.string().optional(),
  /** só em camadas da faixa contínua: posição relativa a um slide (x passa a contar a partir dele). */
  ancora: z.object({ slide: z.union([z.number().int().min(0), z.literal('ultimo')]) }).optional(),
  /** só em camadas da faixa contínua: ocupa a largura da faixa toda. */
  estica: z.boolean().optional(),
  /** só em camadas da faixa: desenha por cima das camadas dos slides (padrão: por baixo). */
  acima: z.boolean().optional(),
};

export const Destaque = z.object({
  fonte: RefFonte.optional(),
  peso: z.number().int().min(100).max(900).optional(),
  italico: z.boolean().optional(),
  cor: Cor.optional(),
});

export const CamadaTexto = z.object({
  ...base,
  tipo: z.literal('texto'),
  texto: z.string(),
  fonte: RefFonte.optional(),
  tamanho: z.number().min(4).max(600).optional(),
  peso: z.number().int().min(100).max(900).optional(),
  italico: z.boolean().optional(),
  cor: Cor.optional(),
  alinhamento: z.enum(['left', 'center', 'right']).optional(),
  alinhamentoV: z.enum(['top', 'middle', 'bottom']).optional(),
  /** altura da linha como múltiplo do tamanho (1.1 = 110%). */
  entrelinha: z.number().min(0.5).max(3).optional(),
  /** espaçamento entre letras em em (−0.05 = −5%). */
  espacamento: z.number().min(-0.2).max(1).optional(),
  autoAjuste: z.boolean().optional(),
  tamanhoMin: z.number().min(4).optional(),
  maxCaracteres: z.number().int().min(1).optional(),
  caixaAlta: z.boolean().optional(),
  contorno: Borda.optional(),
  sombra: Sombra.optional(),
  destaque: Destaque.optional(),
});

export const Filtros = z.object({
  brilho: z.number().min(0).max(3).optional(),
  contraste: z.number().min(0).max(3).optional(),
  saturacao: z.number().min(0).max(3).optional(),
  pb: z.boolean().optional(),
});

export const CamadaImagem = z.object({
  ...base,
  tipo: z.enum(['imagem', 'logo']),
  assetId: z.string().optional(),
  url: z.string().optional(),
  /** texto mostrado na área vazia (ex.: "Foto do prato"). */
  placeholder: z.string().optional(),
  ajuste: z.enum(['cover', 'contain']).optional(),
  foco: Ponto.optional(),
  zoom: z.number().min(1).max(5).optional(),
  raio: z.number().min(0).optional(),
  filtros: Filtros.optional(),
  borda: Borda.optional(),
  sombra: Sombra.optional(),
});

/** Ponto de controle da linha de luz, preso a um slide: x em px a partir da borda esquerda do slide e y em px a
 *  partir do topo da camada. 'ultimo' acompanha o último slide quando o carrossel cresce ou encolhe. */
export const PontoDaLinha = z.object({
  slide: z.union([z.number().int().min(0), z.literal('ultimo')]),
  x: z.number(),
  y: z.number(),
});
export type PontoDaLinha = z.infer<typeof PontoDaLinha>;

export const CamadaForma = z.object({
  ...base,
  tipo: z.literal('forma'),
  /** progresso: barra cuja parte preenchida acompanha slide ÷ total (fundo = borda.cor, parte cheia = preenchimento). */
  forma: z.enum(['retangulo', 'elipse', 'linha', 'caminho', 'linhaDeLuz', 'progresso']),
  preenchimento: Preenchimento.optional(),
  borda: Borda.optional(),
  raioBorda: z.number().min(0).optional(),
  sombra: Sombra.optional(),
  /** caminho SVG (forma 'caminho'), em coordenadas da própria caixa. */
  caminho: z.string().optional(),
  /** parâmetros da forma procedural (linhaDeLuz: semente, espessura, inicioX, fimX, yMin, yMax). */
  parametros: z.record(z.string(), z.number()).optional(),
  /** linhaDeLuz: pontos de controle por slide. Quando existem, a linha passa por eles (em vez da semente). */
  pontos: z.array(PontoDaLinha).optional(),
  /** progresso: cor do trilho (parte vazia). */
  trilho: Cor.optional(),
});

export const CamadaIcone = z.object({
  ...base,
  tipo: z.literal('icone'),
  nome: z.string().min(1),
  cor: Cor.optional(),
  traco: z.number().min(0.5).max(6).optional(),
});

export const CamadaComponente = z.object({
  ...base,
  tipo: z.literal('componente'),
  componenteId: z.string().min(1),
  /** padrão: escala uniforme (o componente não deforma) e centralizado na caixa; true estica nos dois eixos. */
  esticar: z.boolean().optional(),
  /** ajustes por camada interna do componente (pelo id). */
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type CamadaTexto = z.infer<typeof CamadaTexto>;
export type CamadaImagem = z.infer<typeof CamadaImagem>;
export type CamadaForma = z.infer<typeof CamadaForma>;
export type CamadaIcone = z.infer<typeof CamadaIcone>;
export type CamadaComponente = z.infer<typeof CamadaComponente>;
export type CamadaGrupo = Omit<z.infer<z.ZodObject<typeof base>>, never> & { tipo: 'grupo'; filhos: Camada[] };
export type Camada = CamadaTexto | CamadaImagem | CamadaForma | CamadaIcone | CamadaComponente | CamadaGrupo;
export type TipoCamada = Camada['tipo'];

export const CamadaGrupo: z.ZodType<CamadaGrupo> = z.object({
  ...base,
  tipo: z.literal('grupo'),
  filhos: z.array(z.lazy(() => Camada)),
});

export const Camada: z.ZodType<Camada> = z.lazy(() =>
  z.union([CamadaTexto, CamadaImagem, CamadaForma, CamadaIcone, CamadaComponente, CamadaGrupo]),
);
