import { useEffect, useState } from 'react';
import { ouvirBanco } from '@/dados/repositorio';

export type AvisoDoBancoAtivo = 'banco-atualizado' | 'banco-bloqueado' | null;

/** Aviso do armazenamento local que está valendo: o banco foi atualizado em outra aba (esta precisa recarregar) ou
 *  outra aba está impedindo a atualização. */
export function useAvisoDoBanco(): AvisoDoBancoAtivo {
  const [aviso, setAviso] = useState<AvisoDoBancoAtivo>(null);
  useEffect(
    () => ouvirBanco((a) => (a.tipo === 'banco-atualizado' || a.tipo === 'banco-bloqueado') && setAviso(a.tipo)),
    [],
  );
  return aviso;
}
