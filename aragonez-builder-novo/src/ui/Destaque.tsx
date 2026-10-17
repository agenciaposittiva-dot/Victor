import { Fragment } from 'react';
import { parseDestaque } from '@/dominio/destaque';

/** Mostra *trechos entre asteriscos* com a classe de destaque (serif itálico laranja) na interface.
 *  Usa as mesmas regras dos slides (parseDestaque). */
export function Destaque({ texto }: { texto: string }) {
  return (
    <>
      {parseDestaque(texto).map((t, i) =>
        t.destaque ? (
          <em key={i} className="destaque-serif">
            {t.texto}
          </em>
        ) : (
          <Fragment key={i}>{t.texto}</Fragment>
        ),
      )}
    </>
  );
}
