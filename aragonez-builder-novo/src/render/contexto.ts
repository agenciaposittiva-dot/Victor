import { createContext, useContext } from 'react';
import type { KitTokens } from '@/dominio/tokens';
import type { Componente, Formato } from '@/dominio/schemas';

export type ContextoRender = {
  kit: KitTokens;
  formato: Formato;
  componentes: Componente[];
  /** resolve assetId → URL (Brand Kit, biblioteca, uploads). */
  urlDoAsset?: (assetId: string) => string | undefined;
};

export const CtxRender = createContext<ContextoRender | null>(null);

export function useRender(): ContextoRender {
  const c = useContext(CtxRender);
  if (!c) throw new Error('Renderizador sem contexto: envolva com <CtxRender.Provider>');
  return c;
}

/** Cadeia de componentes abertos acima desta camada (proteção contra componente dentro de si mesmo). */
export const CtxComponentesAbertos = createContext<string[]>([]);
