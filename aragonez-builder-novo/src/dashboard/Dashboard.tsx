import { Link, useNavigate } from 'react-router-dom';
import { Botao } from '@/ui/Botao';
import { Cabecalho } from '@/ui/Cabecalho';
import { Vazio } from '@/ui/Vazio';
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
  const navegar = useNavigate();
  return (
    <>
      <Cabecalho
        etiqueta="// Dashboard"
        titulo="O que vamos *criar* hoje?"
        texto="Seus projetos recentes, organizados por cliente. Comece por um layout pronto ou transforme uma arte em JPG num layout editável."
        acoes={
          <>
            <Botao variante="secundario" icone="imagem" onClick={() => navegar('/biblioteca')}>
              JPG → Layout
            </Botao>
            <Botao variante="primario" icone="mais" onClick={() => navegar('/biblioteca')}>
              Novo projeto
            </Botao>
          </>
        }
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
      <Vazio
        icone="painel"
        titulo="Nenhum projeto ainda"
        texto="Quando você criar um carrossel ou post, ele aparece aqui com a miniatura, separado por cliente. Dá para duplicar, renomear, buscar e excluir."
        acoes={
          <Botao variante="primario" icone="mais" onClick={() => navegar('/biblioteca')}>
            Escolher um layout
          </Botao>
        }
      />
    </>
  );
}
