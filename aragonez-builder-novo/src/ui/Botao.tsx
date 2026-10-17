import type { ButtonHTMLAttributes } from 'react';
import { Icone, type NomeIcone } from './Icone';
import css from './Botao.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo';
  tamanho?: 'pequeno' | 'medio' | 'grande';
  icone?: NomeIcone;
};

export function Botao({
  variante = 'secundario',
  tamanho = 'medio',
  icone,
  className,
  children,
  type = 'button',
  ...resto
}: Props) {
  const classes = [css.botao, css[variante], tamanho !== 'medio' ? css[tamanho] : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...resto}>
      {icone && <Icone nome={icone} tamanho={tamanho === 'pequeno' ? 16 : 18} />}
      {children}
    </button>
  );
}
