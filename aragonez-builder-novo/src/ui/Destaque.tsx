import { Fragment } from 'react';

/** Mostra *trechos entre asteriscos* com a classe de destaque (serif itálico laranja) na interface. */
export function Destaque({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') ? (
          <em key={i} className="destaque-serif">
            {p.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
