/** Onde os dados moram: na nuvem (Supabase) quando as variáveis existem; senão, no navegador (modo local). */
export type Modo = 'nuvem' | 'local';

export type Ambiente = { modo: Modo; supabaseUrl?: string; supabaseAnonKey?: string };

export function detectarAmbiente(env: Record<string, string | undefined> = import.meta.env): Ambiente {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const chave = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (/^https:\/\/.+/.test(url) && chave.length > 20)
    return { modo: 'nuvem', supabaseUrl: url, supabaseAnonKey: chave };
  return { modo: 'local' };
}

export const ambiente = detectarAmbiente();
