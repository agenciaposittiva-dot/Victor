import { current, isDraft } from 'immer';
import type { Camada } from './schemas';

/** Troca rascunhos do immer (em qualquer nível de listas e objetos) pelo valor atual deles. */
function semRascunhos(v: unknown): unknown {
  if (isDraft(v)) return current(v as never);
  if (Array.isArray(v)) return v.map(semRascunhos);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, semRascunhos(x)]));
  return v;
}

/** Cópia profunda e independente, sempre. Dentro de editor.editar os dados são rascunhos do immer, que o
 *  structuredClone recusa (DataCloneError), e o current() devolve as partes não alteradas como os objetos
 *  originais (congelados, compartilhados com o histórico): por isso os rascunhos viram current() e o resultado
 *  inteiro passa pelo structuredClone. */
export const clonar = <T>(v: T): T => structuredClone(semRascunhos(v)) as T;

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
    const nova = { ...clonar(c), id: idLivre(c.id, usados) } as Camada;
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

/** Fotos entram no documento só como referência (assetId). Endereços temporários (blob:) ou a foto embutida
 *  (data:) nunca são salvos: não sobrevivem a recarregar a página e deixariam projeto e histórico pesados. */
export const urlTemporaria = (url: unknown) => typeof url === 'string' && /^(blob|data):/i.test(url);

export function semUrlsTemporarias(camadas: Camada[]): Camada[] {
  let mudou = false;
  const r = camadas.map((c) => {
    let nova = c;
    if ((c.tipo === 'imagem' || c.tipo === 'logo') && urlTemporaria(c.url)) {
      const { url: _u, ...resto } = c;
      nova = resto as Camada;
      mudou = true;
    }
    if (nova.tipo === 'grupo') {
      const filhos = semUrlsTemporarias(nova.filhos);
      if (filhos !== nova.filhos) {
        nova = { ...nova, filhos };
        mudou = true;
      }
    }
    return nova;
  });
  return mudou ? r : camadas;
}
