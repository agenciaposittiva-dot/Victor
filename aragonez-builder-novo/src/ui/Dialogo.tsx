import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Icone } from './Icone';
import css from './Dialogo.module.css';

/** Diálogo modal (elemento <dialog> nativo: foco preso dentro, Esc fecha, fundo escurecido). O showModal() foca o
 *  primeiro elemento focável (o X do cabeçalho) e o autoFocus do React não resolve (o React não põe o atributo no
 *  HTML, e o showModal roda depois): quem precisa de outro foco passa focoInicial (ou marca o botão com
 *  data-foco-inicial), focado logo depois do showModal, no mesmo efeito. */
export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  children,
  acoes,
  largura = 560,
  fecharComEsc = true,
  focoInicial,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  acoes?: ReactNode;
  largura?: number;
  /** false: decisões obrigatórias (ex.: conflito) não fecham com Esc. */
  fecharComEsc?: boolean;
  /** elemento que recebe o foco ao abrir (ex.: "Voltar e corrigir", para Enter não confirmar). */
  focoInicial?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      d.showModal?.();
      (focoInicial?.current ?? d.querySelector<HTMLElement>('[data-foco-inicial]'))?.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto, focoInicial]);
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
