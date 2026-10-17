import { useSyncExternalStore } from 'react';
import { exportarTudo } from '@/dados/backup';
import { repo } from '@/dados/repositorio';
import { baixar } from '@/exportar/arquivos';

/** "Exportar tudo" (uma função só para a tela de projetos e para o aviso de armazenamento cheio): baixa o .zip e
 *  guarda a data do último backup, mostrada no aviso de Modo local. */
const CHAVE = 'aragonez:ultimoBackup';
const ouvintes = new Set<() => void>();

export function dataDoUltimoBackup(): string | undefined {
  try {
    return localStorage.getItem(CHAVE) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function exportarBackupEBaixar(): Promise<void> {
  const zip = await exportarTudo(repo.atual);
  baixar(zip, `aragonez-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  try {
    localStorage.setItem(CHAVE, new Date().toISOString());
  } catch {
    /* sem localStorage: só não mostra a data */
  }
  ouvintes.forEach((f) => f());
}

export function useUltimoBackup(): string | undefined {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    dataDoUltimoBackup,
    () => undefined,
  );
}
