import type { ReactNode } from 'react';
import { Destaque } from './Destaque';
import css from './Cabecalho.module.css';

/** Cabeçalho de página. No título, *palavra* ganha o destaque em serif itálico laranja (como nos layouts da marca). */
export function Cabecalho({
  etiqueta,
  titulo,
  texto,
  acoes,
}: {
  etiqueta?: string;
  titulo: string;
  texto?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className={css.cabecalho}>
      <div>
        {etiqueta && <span className="etiqueta">{etiqueta}</span>}
        <h1 className={css.titulo}>
          <Destaque texto={titulo} />
        </h1>
        {texto && <p className={css.texto}>{texto}</p>}
      </div>
      {acoes && <div className={css.acoes}>{acoes}</div>}
    </header>
  );
}
