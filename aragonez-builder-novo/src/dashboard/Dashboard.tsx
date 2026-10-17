import { Link } from 'react-router-dom';
import { Projetos } from '@/projetos/Projetos';
import { Cabecalho } from '@/ui/Cabecalho';
import css from './Dashboard.module.css';

const PASSOS = [
  { para: '/kits', n: '01', t: 'Escolha o Brand Kit', d: 'Cores, fontes, logos e o tom de voz de cada cliente.' },
  {
    para: '/biblioteca',
    n: '02',
    t: 'Escolha um layout',
    d: 'Carrosséis e posts prontos que vestem a marca escolhida.',
  },
  { para: '/editor', n: '03', t: 'Preencha e exporte', d: 'Edite no Modo Conteúdo e baixe em JPG, PNG, PDF ou ZIP.' },
];

export default function Dashboard() {
  return (
    <>
      <Cabecalho
        etiqueta="// Dashboard"
        titulo="O que vamos *criar* hoje?"
        texto="Seus projetos recentes. Comece por um layout pronto ou crie do zero no Modo Design."
      />
      <section className={css.passos} aria-label="Primeiros passos">
        {PASSOS.map((p) => (
          <Link key={p.n} to={p.para} className={css.passo}>
            <span className={css.numero}>{p.n}</span>
            <b>{p.t}</b>
            <span>{p.d}</span>
          </Link>
        ))}
      </section>
      <Projetos
        limite={8}
        vazio={{
          titulo: 'Nenhum projeto ainda',
          texto:
            'Quando você criar um carrossel ou post, ele aparece aqui com a miniatura. Dá para renomear, duplicar, buscar e excluir.',
        }}
      />
    </>
  );
}
