import { useSyncExternalStore } from 'react';
import type { DocumentoEditavel } from '@/dominio/edicao';
import type { Camada, Fundo } from '@/dominio/schemas';
import { ImagemIlegivel, prepararImagem } from './imagens';
import { repo } from './repositorio';

/** Endereços (object URL) dos arquivos guardados no navegador, para desenhar fotos e logos. Os projetos guardam
 *  só o assetId; o endereço é criado ao abrir e vale enquanto a página estiver aberta. */
const urls = new Map<string, string>();
const carregando = new Map<string, Promise<void>>();
let versao = 0;
const ouvintes = new Set<() => void>();
const mudou = () => {
  versao++;
  ouvintes.forEach((f) => f());
};

export const urlDoArquivo = (id: string) => urls.get(id);

export async function carregarArquivos(ids: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(ids)].map((id) => {
      if (urls.has(id)) return null;
      if (!carregando.has(id))
        carregando.set(
          id,
          repo.atual
            .lerArquivo(id)
            .then((b) => {
              if (b) {
                urls.set(id, URL.createObjectURL(b));
                mudou();
              } else carregando.delete(id);
            })
            .catch((e: unknown) => {
              // tira da lista para poder tentar de novo e não deixa a Promise rejeitada solta
              carregando.delete(id);
              console.warn(`Não consegui ler o arquivo ${id}:`, e);
            }),
        );
      return carregando.get(id);
    }),
  );
}

/** Muda quando um arquivo novo fica disponível (para redesenhar quem estava mostrando o espaço vazio). */
export function useVersaoArquivos(): number {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => versao,
    () => 0,
  );
}

/** assetIds usados nas camadas e fundos de um documento. */
export function arquivosDoDocumento(doc: DocumentoEditavel): string[] {
  const r = new Set<string>();
  const camadas = (cs: Camada[]) =>
    cs.forEach((c) => {
      if ((c.tipo === 'imagem' || c.tipo === 'logo') && c.assetId) r.add(c.assetId);
      if (c.tipo === 'grupo') camadas(c.filhos);
    });
  const fundo = (f?: Fundo) => f?.tipo === 'imagem' && f.assetId && r.add(f.assetId);
  doc.slides.forEach((s) => {
    camadas(s.camadas);
    fundo(s.fundo);
  });
  camadas(doc.faixa);
  return [...r];
}

/** Recebe uma foto do usuário: reduz (respeitando a orientação do celular), grava e devolve o assetId.
 *  Formato que não abre neste navegador lança ImagemIlegivel e nada é gravado. */
export async function enviarFoto(arquivo: File | Blob): Promise<string> {
  const { blob } = await prepararImagem(arquivo);
  const id = await repo.atual.salvarArquivo(blob, 'name' in arquivo ? arquivo.name : undefined);
  urls.set(id, URL.createObjectURL(blob));
  mudou();
  return id;
}

export { ImagemIlegivel };
