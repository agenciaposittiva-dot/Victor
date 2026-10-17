import type { ReactNode } from 'react';
import { Icone } from './Icone';
import css from './AvisoFixo.module.css';

const TIPO = { aviso: 'tipoAviso', erro: 'tipoErro', info: 'tipoInfo' } as const;

/** Aviso que fica na tela até a pessoa agir (conflito com outra aba, kit que não existe, banco atualizado…).
 *  Não some sozinho como um toast. */
export function AvisoFixo({
  tipo = 'aviso',
  titulo,
  children,
  acoes,
  testid,
}: {
  tipo?: 'aviso' | 'erro' | 'info';
  titulo: string;
  children?: ReactNode;
  acoes?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      className={[css.aviso, css[TIPO[tipo]]].join(' ')}
      role={tipo === 'erro' ? 'alert' : 'status'}
      data-testid={testid}
    >
      <span className={css.icone}>
        <Icone nome={tipo === 'info' ? 'ajuda' : 'alerta'} tamanho={18} />
      </span>
      <div className={css.texto}>
        <b>{titulo}</b>
        {children && <span>{children}</span>}
      </div>
      {acoes && <div className={css.acoes}>{acoes}</div>}
    </div>
  );
}
