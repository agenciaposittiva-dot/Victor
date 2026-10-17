import { Icone } from './Icone';
import { useToasts } from './toast';
import css from './Toasts.module.css';

/** Toasts só confirmam ("Salvo", "Exportado") ou contam um erro de uma ação. O que pede decisão ou bloqueia algo
 *  fica num aviso fixo (AvisoFixo) ou num diálogo, nunca num toast que some. Erros usam role="alert" para o
 *  leitor de tela anunciar na hora. */
export function Toasts() {
  const { toasts, fechar } = useToasts();
  return (
    <div className={css.pilha}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tipo === 'erro' ? 'alert' : 'status'}
          aria-live={t.tipo === 'erro' ? 'assertive' : 'polite'}
          className={[css.toast, t.tipo !== 'info' ? css[t.tipo] : ''].join(' ')}
        >
          <p>{t.texto}</p>
          <button type="button" className={css.fechar} onClick={() => fechar(t.id)} aria-label="Fechar aviso">
            <Icone nome="fechar" tamanho={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
