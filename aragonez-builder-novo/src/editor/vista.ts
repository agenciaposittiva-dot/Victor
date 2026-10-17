import { create } from 'zustand';

/** Zoom e rolagem do canvas: ficam fora do histórico (desfazer não mexe na vista). */
export type Vista = { zoom: number; x: number; y: number };
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;

export const useVista = create<Vista>()(() => ({ zoom: 0.4, x: 40, y: 40 }));

export const vista = {
  definir(v: Partial<Vista>) {
    const atual = useVista.getState();
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom ?? atual.zoom));
    useVista.setState({ ...atual, ...v, zoom });
  },
  /** Zoom mantendo parado o ponto da tela (px, py) relativo ao canvas. */
  zoomEm(fator: number, px: number, py: number) {
    const { zoom, x, y } = useVista.getState();
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * fator));
    const k = novo / zoom;
    useVista.setState({ zoom: novo, x: px - (px - x) * k, y: py - (py - y) * k });
  },
  /** Mostra o retângulo (em px do documento) inteiro na área w×h, com margem. */
  enquadrar(r: { x: number; y: number; w: number; h: number }, area: { w: number; h: number }, margem = 48) {
    const zoom = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.min((area.w - margem * 2) / r.w, (area.h - margem * 2) / r.h)),
    );
    useVista.setState({ zoom, x: (area.w - r.w * zoom) / 2 - r.x * zoom, y: (area.h - r.h * zoom) / 2 - r.y * zoom });
  },
};
