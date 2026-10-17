import { useEffect, useRef, type ReactNode } from 'react';
import { Icone } from './Icone';
import css from './Dialogo.module.css';

/** Diálogo modal (elemento <dialog> nativo: foco preso dentro, Esc fecha, fundo escurecido). */
export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  children,
  acoes,
  largura = 560,
  fecharComEsc = true,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  acoes?: ReactNode;
  largura?: number;
  /** false: decisões obrigatórias (ex.: conflito) não fecham com Esc. */
  fecharComEsc?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal?.();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  if (!aberto) return null;
  return (
    <dialog
      ref={ref}
      className={css.dialogo}
      style={{ width: `min(${largura}px, calc(100vw - 24px))` }}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        if (fecharComEsc) aoFechar();
      }}
      onClose={() => {
        // no Chrome, Esc duas vezes fecha o <dialog> mesmo com preventDefault no cancel
        if (!aberto) return;
        if (fecharComEsc) aoFechar();
        else ref.current?.showModal?.();
      }}
    >
      <header className={css.topo}>
        <h2>{titulo}</h2>
        {fecharComEsc && (
          <button type="button" className={css.fechar} onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" tamanho={18} />
          </button>
        )}
      </header>
      <div className={css.corpo}>{children}</div>
      {acoes && <footer className={css.rodape}>{acoes}</footer>}
    </dialog>
  );
}
