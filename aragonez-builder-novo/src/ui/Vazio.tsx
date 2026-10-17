import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';
import css from './Vazio.module.css';

/** Estado vazio que orienta o próximo passo (nunca uma tela em branco). */
export function Vazio({
  icone,
  titulo,
  texto,
  passos,
  acoes,
}: {
  icone: NomeIcone;
  titulo: string;
  texto: ReactNode;
  passos?: string[];
  acoes?: ReactNode;
}) {
  return (
    <section className={css.vazio} aria-label={titulo}>
      <span className={css.icone}>
        <Icone nome={icone} tamanho={26} />
      </span>
      <h2 className={css.titulo}>{titulo}</h2>
      <p className={css.texto}>{texto}</p>
      {passos && passos.length > 0 && (
        <ol className={css.passos}>
          {passos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      )}
      {acoes && <div className={css.acoes}>{acoes}</div>}
    </section>
  );
}
