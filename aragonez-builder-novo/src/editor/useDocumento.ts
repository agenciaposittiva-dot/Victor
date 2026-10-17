import { useMemo } from 'react';
import type { SlideEditavel } from '@/dominio/edicao';
import { tipoDoLayout, type SlideMontado } from '@/dominio/montagem';
import type { BrandKit, Layout } from '@/dominio/schemas';
import { KIT_NEUTRO } from '@/seeds/kits';
import { useEditor } from './estado';
import type { Contexto } from './operacoes';

/** Slide do editor → slide montado, com cache por objeto: editar um slide não refaz os outros (memorização). */
const cache = new WeakMap<SlideEditavel, { layout: Layout; indice: number; m: SlideMontado }>();
export function montadoDo(layout: Layout, s: SlideEditavel, indice: number): SlideMontado {
  const salvo = cache.get(s);
  if (salvo && salvo.layout === layout && salvo.indice === indice) return salvo.m;
  const tipo = tipoDoLayout(layout, s.tipoId);
  const m = { indice, tipo, fundo: s.fundo ?? tipo.fundo, camadas: s.camadas };
  cache.set(s, { layout, indice, m });
  return m;
}

/** Slides montados, layout com a faixa do editor e kit para desenhar (o neutro se o do projeto não existe). */
export function useDocumento() {
  const layout = useEditor((s) => s.layout)!;
  const kitDoProjeto = useEditor((s) => s.kit);
  const slides = useEditor((s) => s.doc.slides);
  const faixa = useEditor((s) => s.doc.faixa);
  const montados = useMemo(() => slides.map((s, i) => montadoDo(layout, s, i)), [layout, slides]);
  const efetivo = useMemo(
    () => (layout.continuo ? { ...layout, faixa: { ...layout.faixa, camadas: faixa } } : layout),
    [layout, faixa],
  );
  const ctx: Contexto = useMemo(
    () => ({ w: layout.formato.w, h: layout.formato.h, continuo: !!layout.continuo }),
    [layout.formato.w, layout.formato.h, layout.continuo],
  );
  const kit: BrandKit = kitDoProjeto ?? KIT_NEUTRO;
  return { layout, efetivo, montados, ctx, kit, kitFaltando: !kitDoProjeto };
}
