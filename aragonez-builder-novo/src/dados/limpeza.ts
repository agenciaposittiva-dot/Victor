import type { Repositorio } from './repositorio';

/** Ids de arquivo (assetId das fotos e logos, arquivoId das fontes enviadas) em qualquer lugar de um registro
 *  salvo: conteúdo, ajustes, extras, fundos, faixa, componentes. Lê o registro bruto, então vale também para os que
 *  não validam ("precisa de atualização"). */
export function arquivosDoRegistro(valor: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) valor.forEach((v) => arquivosDoRegistro(v, ids));
  else if (valor && typeof valor === 'object')
    for (const [k, v] of Object.entries(valor)) {
      if ((k === 'assetId' || k === 'arquivoId') && typeof v === 'string' && v) ids.add(v);
      else arquivosDoRegistro(v, ids);
    }
  return ids;
}

/** Exclui o projeto e os arquivos que só ele usava: um arquivo usado por outro projeto, por um layout ou por um kit
 *  fica. O projeto sai primeiro; se apagar os arquivos falhar, eles só ficam sobrando (nada que alguém use some). */
export async function excluirProjetoEArquivos(r: Repositorio, id: string): Promise<{ arquivosApagados: number }> {
  const projetos = await r.brutos('projetos');
  const dele = arquivosDoRegistro(projetos.find((p) => p.id === id));
  await r.excluirProjeto(id);
  if (!dele.size) return { arquivosApagados: 0 };
  const [layouts, kits] = await Promise.all([r.brutos('layouts'), r.brutos('kits')]);
  const usados = arquivosDoRegistro([projetos.filter((p) => p.id !== id), layouts, kits]);
  const soltos = [...dele].filter((a) => !usados.has(a));
  await r.excluirArquivos(soltos);
  return { arquivosApagados: soltos.length };
}
