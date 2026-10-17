import type { Camada } from './schemas';

/** Todos os ids de uma árvore de camadas (inclusive dentro de grupos). */
export function idsDaArvore(camadas: Camada[], r = new Set<string>()): Set<string> {
  for (const c of camadas) {
    r.add(c.id);
    if (c.tipo === 'grupo') idsDaArvore(c.filhos, r);
  }
  return r;
}

/** Id novo, que não existe em "usados" (e passa a existir): base-2, base-3… */
export function idLivre(base: string, usados: Set<string>): string {
  const raiz = base.replace(/-\d+$/, '');
  let n = 2;
  let id = `${raiz}-${n}`;
  while (usados.has(id)) id = `${raiz}-${++n}`;
  usados.add(id);
  return id;
}

/** Cópia de camadas com ids novos (a camada e, num grupo, todos os filhos). Duplicar e colar usam isto: uma cópia
 *  com o mesmo id da original receberia os ajustes dela e confundiria seleção e salvamento. */
export function copiarComIdsNovos(camadas: Camada[], usados: Set<string>): Camada[] {
  return camadas.map((c) => {
    const nova = { ...structuredClone(c), id: idLivre(c.id, usados) } as Camada;
    if (nova.tipo === 'grupo') nova.filhos = copiarComIdsNovos(nova.filhos, usados);
    return nova;
  });
}

/** Ids repetidos ganham ids novos (as repetições, não a primeira). Determinístico: a mesma lista dá sempre os
 *  mesmos ids novos (base-2, base-3…). "usados" já começa com ids que não podem ser repetidos (ex.: os do layout). */
export function garantirIdsUnicos(camadas: Camada[], usados = new Set<string>()): Camada[] {
  let mudou = false;
  const r = camadas.map((c) => {
    let nova = c;
    if (usados.has(c.id)) {
      nova = { ...c, id: idLivre(c.id, usados) } as Camada;
      mudou = true;
    } else usados.add(c.id);
    if (nova.tipo === 'grupo') {
      const filhos = garantirIdsUnicos(nova.filhos, usados);
      if (filhos !== nova.filhos) {
        nova = { ...nova, filhos };
        mudou = true;
      }
    }
    return nova;
  });
  return mudou ? r : camadas;
}
