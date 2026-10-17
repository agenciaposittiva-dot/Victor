import type { Camada, CamadaComponente, Componente } from './schemas';

/** Aplica ajustes (por id) numa árvore de camadas, inclusive dentro de grupos. */
export function aplicarOverrides(
  camadas: Camada[],
  overrides: Record<string, Record<string, unknown>> | undefined,
): Camada[] {
  if (!overrides || !Object.keys(overrides).length) return camadas;
  return camadas.map((c) => {
    const o = overrides[c.id];
    let nova = (o ? { ...c, ...o, id: c.id, tipo: c.tipo } : c) as Camada;
    if (nova.tipo === 'grupo') nova = { ...nova, filhos: aplicarOverrides(nova.filhos, overrides) };
    return nova;
  });
}

export type ComponenteExpandido = {
  componente: Componente;
  camadas: Camada[];
  escalaX: number;
  escalaY: number;
  deslocX: number;
  deslocY: number;
  /** cadeia de componentes já abertos (para passar adiante ao desenhar o que está dentro). */
  visitados: string[];
};

/** Avisos de componente que contém a si mesmo (direta ou indiretamente). Trocável nos testes. */
export const avisosDeComponente = { avisar: (msg: string) => console.warn(msg) };

/** Uma instância de componente vira as camadas do componente, com os ajustes da instância. Por padrão a escala é
 *  uniforme (a menor das duas: o componente nunca deforma) e o componente fica centralizado na caixa quando sobra
 *  espaço; com esticar: true, cada eixo usa a própria escala. Ex.: o Header de 299×64 numa caixa de 467,25×100.
 *  "visitados" é a cadeia de componentes já abertos: se o componente pedido já está nela (A → B → A), para e avisa. */
export function expandirComponente(
  inst: CamadaComponente,
  componentes: Componente[],
  visitados: string[] = [],
): ComponenteExpandido | null {
  if (visitados.includes(inst.componenteId)) {
    avisosDeComponente.avisar(
      `Componente "${inst.componenteId}" contém a si mesmo (${[...visitados, inst.componenteId].join(' → ')}); parei de desenhar aqui.`,
    );
    return null;
  }
  const componente = componentes.find((c) => c.id === inst.componenteId);
  if (!componente) return null;
  const sx = componente.w ? inst.w / componente.w : 1;
  const sy = componente.h ? inst.h / componente.h : 1;
  const camadas = aplicarOverrides(componente.camadas, inst.overrides);
  const cadeia = [...visitados, componente.id];
  if (inst.esticar) return { componente, camadas, escalaX: sx, escalaY: sy, deslocX: 0, deslocY: 0, visitados: cadeia };
  const e = Math.min(sx, sy);
  return {
    componente,
    camadas,
    escalaX: e,
    escalaY: e,
    deslocX: (inst.w - componente.w * e) / 2,
    deslocY: (inst.h - componente.h * e) / 2,
    visitados: cadeia,
  };
}

/** Primeiro ciclo encontrado entre componentes (ex.: ['a', 'b', 'a']) ou null. Usado na validação do layout. */
export function cicloDeComponentes(componentes: Pick<Componente, 'id' | 'camadas'>[]): string[] | null {
  const porId = new Map(componentes.map((c) => [c.id, c]));
  const usos = (cs: Camada[]): string[] =>
    cs.flatMap((c) => (c.tipo === 'componente' ? [c.componenteId] : c.tipo === 'grupo' ? usos(c.filhos) : []));
  const visitar = (id: string, cadeia: string[]): string[] | null => {
    if (cadeia.includes(id)) return [...cadeia, id];
    const c = porId.get(id);
    if (!c) return null;
    for (const u of usos(c.camadas)) {
      const r = visitar(u, [...cadeia, id]);
      if (r) return r;
    }
    return null;
  };
  for (const c of componentes) {
    const r = visitar(c.id, []);
    if (r) return r;
  }
  return null;
}
