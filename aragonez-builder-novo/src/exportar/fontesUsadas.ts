import { expandirComponente } from '@/dominio/componentes';
import { camadasDaFaixa, type SlideMontado } from '@/dominio/montagem';
import type { Camada, Layout } from '@/dominio/schemas';
import type { KitTokens } from '@/dominio/tokens';
import { resolverTextoCamada } from '@/render/estiloTexto';
import type { UsoDeFonte } from '@/render/fontes';

/** Fontes (família, peso, estilo) que os slides montados realmente usam: inclui os ajustes do projeto
 *  (override de fonte numa camada) e os ajustes dentro de componentes. Carregadas antes de desenhar. */
export function fontesDosSlides(
  layout: Layout,
  slides: SlideMontado[],
  kit: KitTokens,
  faixaOverrides?: Record<string, Record<string, unknown>>,
): UsoDeFonte[] {
  const usos: UsoDeFonte[] = [];
  const andar = (cs: Camada[], abertos: string[] = []) =>
    cs.forEach((c) => {
      if (c.oculta) return;
      if (c.tipo === 'texto') usos.push(...resolverTextoCamada(c, kit, c.tamanho ?? 48).usos);
      else if (c.tipo === 'grupo') andar(c.filhos, abertos);
      else if (c.tipo === 'componente') {
        const exp = expandirComponente(c, layout.componentes, abertos);
        if (exp) andar(exp.camadas, exp.visitados);
      }
    });
  slides.forEach((s) => andar(s.camadas));
  andar(camadasDaFaixa(layout, slides.length, faixaOverrides));
  const unicos = new Map(usos.map((u) => [`${u.familia}|${u.peso ?? 400}|${u.italico ? 1 : 0}`, u]));
  return [...unicos.values()];
}
