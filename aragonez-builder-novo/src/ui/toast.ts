import { create } from 'zustand';

export type Toast = { id: number; texto: string; tipo: 'info' | 'ok' | 'erro' };

type EstadoToast = {
  toasts: Toast[];
  mostrar: (texto: string, tipo?: Toast['tipo']) => void;
  fechar: (id: number) => void;
};

let proximo = 1;

export const useToasts = create<EstadoToast>((set, get) => ({
  toasts: [],
  mostrar: (texto, tipo = 'info') => {
    const id = proximo++;
    set({ toasts: [...get().toasts, { id, texto, tipo }].slice(-4) });
    setTimeout(() => get().fechar(id), tipo === 'erro' ? 7000 : 3800);
  },
  fechar: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Atalho para mostrar um aviso de qualquer lugar. */
export const avisar = (texto: string, tipo?: Toast['tipo']) => useToasts.getState().mostrar(texto, tipo);
