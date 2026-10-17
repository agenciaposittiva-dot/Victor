import { Icone } from './Icone';
import { useToasts } from './toast';
import css from './Toasts.module.css';

export function Toasts() {
  const { toasts, fechar } = useToasts();
  return (
    <div className={css.pilha} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={[css.toast, t.tipo !== 'info' ? css[t.tipo] : ''].join(' ')}>
          <p>{t.texto}</p>
          <button type="button" className={css.fechar} onClick={() => fechar(t.id)} aria-label="Fechar aviso">
            <Icone nome="fechar" tamanho={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
