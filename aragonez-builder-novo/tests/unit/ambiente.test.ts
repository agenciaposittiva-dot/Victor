import { describe, expect, it } from 'vitest';
import { detectarAmbiente } from '@/dados/ambiente';

describe('detectarAmbiente', () => {
  it('sem variáveis do Supabase, roda em modo local', () => {
    expect(detectarAmbiente({}).modo).toBe('local');
  });
  it('com URL https e chave anônima, usa a nuvem', () => {
    const a = detectarAmbiente({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'x'.repeat(40),
    });
    expect(a).toEqual({ modo: 'nuvem', supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'x'.repeat(40) });
  });
  it('URL inválida ou chave curta caem para o modo local', () => {
    expect(detectarAmbiente({ VITE_SUPABASE_URL: 'http://abc', VITE_SUPABASE_ANON_KEY: 'x'.repeat(40) }).modo).toBe(
      'local',
    );
    expect(
      detectarAmbiente({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'curta' }).modo,
    ).toBe('local');
  });
});
