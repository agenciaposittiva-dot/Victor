import { useSyncExternalStore } from 'react';
import { ImagemIlegivel, prepararImagem } from './imagens';
import { aoTrocarRepositorio, repo } from './repositorio';

/** Endereços (object URL) dos arquivos guardados no navegador, para desenhar fotos e logos. Os projetos guardam
 *  só o assetId; o endereço é criado ao abrir e vale enquanto a página estiver aberta. */
const urls = new Map<string, string>();
/** procurados e não encontrados (ou com erro de leitura): o editor mostra "Foto não encontrada". */
const faltando = new Set<string>();
type Leitura = { achou: boolean; mudou: boolean };
const carregando = new Map<string, Promise<Leitura>>();
/** muda a cada troca de banco: leitura do banco anterior que termina depois é descartada. */
let geracao = 0;
let versao = 0;
const ouvintes = new Set<() => void>();
const mudou = () => {
  versao++;
  ouvintes.forEach((f) => f());
};

export const urlDoArquivo = (id: string) => urls.get(id);
export const arquivoFaltando = (id: string) => faltando.has(id);
/** Muda quando um arquivo fica disponível ou passa a faltar. */
export const versaoDosArquivos = () => versao;

const marcarFalta = (id: string): Leitura => {
  const nova = !faltando.has(id);
  faltando.add(id);
  return { achou: false, mudou: nova };
};

function ler(id: string): Promise<Leitura> {
  const minha = geracao;
  const descartada: Leitura = { achou: false, mudou: false };
  const pedido: Promise<Leitura> = repo.atual
    .lerArquivo(id)
    .then(
      (b) => {
        // o banco foi trocado no meio da leitura: o arquivo é de outro banco (na Fase 6, de outra conta)
        if (minha !== geracao) return descartada;
        if (!b) return marcarFalta(id);
        urls.set(id, URL.createObjectURL(b));
        faltando.delete(id);
        return { achou: true, mudou: true };
      },
      (e: unknown) => {
        if (minha !== geracao) return descartada;
        console.warn(`Não consegui ler o arquivo ${id}:`, e);
        return marcarFalta(id);
      },
    )
    .finally(() => {
      // sai da lista (o que faltou pode ser procurado de novo), se ainda for este pedido
      if (carregando.get(id) === pedido) carregando.delete(id);
    });
  carregando.set(id, pedido);
  return pedido;
}

/** Espera os arquivos e devolve os ids dos que faltam (não existem no navegador ou não deu para ler). Os já
 *  carregados são pulados; os que faltaram são procurados de novo a cada chamada (podem ter voltado num backup).
 *  Avisa os desenhos uma vez por chamada, e só se algo mudou (arquivo novo ou que passou a faltar agora). */
export async function garantirArquivos(ids: Iterable<string>): Promise<string[]> {
  const unicos = [...new Set(ids)];
  const lidas = await Promise.all(
    unicos.map((id) => (urls.has(id) ? { achou: true, mudou: false } : (carregando.get(id) ?? ler(id)))),
  );
  if (lidas.some((l) => l.mudou)) mudou();
  return unicos.filter((_, i) => !lidas[i]!.achou);
}

// outro banco (troca de conta, testes): os endereços e as faltas do anterior não valem mais
aoTrocarRepositorio(() => {
  geracao++;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  faltando.clear();
  carregando.clear();
  mudou();
});

/** Muda quando um arquivo novo fica disponível ou falta (para redesenhar quem mostrava o espaço vazio). */
export function useVersaoArquivos(): number {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    versaoDosArquivos,
    () => 0,
  );
}

/** Grava de volta no banco os arquivos que sumiram de lá mas continuam abertos nesta página. Caso típico: o projeto
 *  foi excluído em outra aba (as fotos que só ele usava saíram junto) e esta aba salva a versão dela como cópia. */
export async function regravarArquivosAbertos(ids: Iterable<string>): Promise<number> {
  let n = 0;
  for (const id of new Set(ids)) {
    const url = urls.get(id);
    if (!url || (await repo.atual.lerArquivo(id))) continue;
    const blob = await (await fetch(url)).blob();
    await repo.atual.gravarBruto('arquivos', { id, tipo: blob.type, blob, criadoEm: new Date().toISOString() });
    n++;
  }
  return n;
}

/** Recebe uma foto do usuário: reduz (respeitando a orientação do celular), grava e devolve o assetId.
 *  Formato que não abre neste navegador lança ImagemIlegivel e nada é gravado. */
export async function enviarFoto(arquivo: File | Blob): Promise<string> {
  const { blob } = await prepararImagem(arquivo);
  const minha = geracao;
  const id = await repo.atual.salvarArquivo(blob, 'name' in arquivo ? arquivo.name : undefined);
  if (minha === geracao) {
    urls.set(id, URL.createObjectURL(blob));
    faltando.delete(id);
    mudou();
  }
  return id;
}

export { ImagemIlegivel };
