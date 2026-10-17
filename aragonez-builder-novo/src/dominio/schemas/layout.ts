import { z } from 'zod';
import { Cor, Formato, Gradiente, Ponto } from './base';
import { cicloDeComponentes } from '../componentes';
import { Camada } from './camada';

export const Brilho = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().min(1),
  h: z.number().min(1),
  cor: Cor,
  /** opacidade no centro (0–1). */
  intensidade: z.number().min(0).max(1),
  /** onde o brilho some, de 0.2 (borda dura) a 1 (bem espalhado). */
  suavidade: z.number().min(0.2).max(1).default(1),
});
export type Brilho = z.infer<typeof Brilho>;

export const Fundo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('cor'), cor: Cor }),
  Gradiente,
  z.object({
    tipo: z.literal('imagem'),
    assetId: z.string().optional(),
    url: z.string().optional(),
    ajuste: z.enum(['cover', 'contain']).default('cover'),
    foco: Ponto.optional(),
    cor: Cor.optional(),
  }),
  z.object({ tipo: z.literal('brilhos'), base: Cor, brilhos: z.array(Brilho) }),
  z.object({ tipo: z.literal('transparente') }),
]);
export type Fundo = z.infer<typeof Fundo>;

/** Bloco reutilizável (ex.: Header, Handle). Editar o componente atualiza todos os usos. */
export const Componente = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  w: z.number().min(1),
  h: z.number().min(1),
  camadas: z.array(Camada),
});
export type Componente = z.infer<typeof Componente>;

export const TipoDeSlide = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  fundo: Fundo,
  camadas: z.array(Camada),
  /** pode aparecer várias vezes seguidas no projeto (ex.: Passo a passo). */
  repetivel: z.boolean().optional(),
});
export type TipoDeSlide = z.infer<typeof TipoDeSlide>;

export const Layout = z
  .object({
    id: z.string().min(1),
    nome: z.string().min(1),
    categoria: z.string().min(1),
    tags: z.array(z.string()).default([]),
    brandKitId: z.string().optional(),
    formato: Formato,
    continuo: z.boolean().optional(),
    /** camadas que atravessam os slides (só em layouts contínuos), em coordenadas da faixa inteira. */
    faixa: z.object({ fundo: Fundo.optional(), camadas: z.array(Camada).default([]) }).optional(),
    componentes: z.array(Componente).default([]),
    tiposDeSlide: z.array(TipoDeSlide).min(1, 'O layout precisa de pelo menos um tipo de slide'),
    margemSegura: z.object({ x: z.number().min(0), y: z.number().min(0) }).optional(),
    /** arquivado: some da biblioteca, mas os projetos que usam continuam abrindo. */
    status: z.enum(['rascunho', 'publicado', 'arquivado']).default('rascunho'),
    origem: z.enum(['seed', 'editor', 'jpg', 'importado']).optional(),
    donoId: z.string().optional(),
    miniaturaUrl: z.string().optional(),
    versaoSchema: z.literal(1).default(1),
    /** marca única de cada gravação (conflito entre abas); atualizadoEm é só para mostrar e ordenar. */
    versao: z.string().optional(),
    atualizadoEm: z.string().optional(),
  })
  .superRefine((l, ctx) => {
    const ids = new Set<string>();
    l.tiposDeSlide.forEach((t, i) => {
      if (ids.has(t.id))
        ctx.addIssue({ code: 'custom', path: ['tiposDeSlide', i, 'id'], message: `Tipo de slide repetido: ${t.id}` });
      ids.add(t.id);
    });
    if (l.faixa && !l.continuo)
      ctx.addIssue({ code: 'custom', path: ['faixa'], message: 'Camadas de faixa só valem em layout contínuo' });
    const ciclo = cicloDeComponentes(l.componentes);
    if (ciclo)
      ctx.addIssue({
        code: 'custom',
        path: ['componentes'],
        message: `Componente contém a si mesmo: ${ciclo.join(' → ')}`,
      });
  });
export type Layout = z.infer<typeof Layout>;
export type LayoutEntrada = z.input<typeof Layout>;
