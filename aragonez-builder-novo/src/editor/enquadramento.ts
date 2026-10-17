/** Pedido para enquadrar a vista (ajustar o zoom) vindo de fora do canvas: botão, atalho, troca de slide.
 *  O canvas registra quem atende. */
export type Enquadramento = 'slide' | 'tudo' | 'centralizar';
let atender: ((o: Enquadramento) => void) | null = null;
export const registrarEnquadramento = (f: ((o: Enquadramento) => void) | null) => {
  atender = f;
};
export const enquadrar = (o: Enquadramento = 'slide') => atender?.(o);
