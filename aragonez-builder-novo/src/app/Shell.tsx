import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ambiente } from '@/dados/ambiente';
import { Botao } from '@/ui/Botao';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { Toasts } from '@/ui/Toasts';
import { AvisosDoBanco } from './AvisosDoBanco';
import css from './Shell.module.css';

const ITENS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: '/', rotulo: 'Dashboard', icone: 'painel' },
  { para: '/biblioteca', rotulo: 'Biblioteca', icone: 'biblioteca' },
  { para: '/editor', rotulo: 'Editor', icone: 'editor' },
  { para: '/kits', rotulo: 'Brand Kits', icone: 'kits' },
];

export function Shell() {
  const [aberto, setAberto] = useState(false);
  const local = useLocation();
  const [rotaAnterior, setRotaAnterior] = useState(local.pathname);
  // no celular o menu é uma gaveta: fecha sozinho ao trocar de tela
  if (rotaAnterior !== local.pathname) {
    setRotaAnterior(local.pathname);
    setAberto(false);
  }
  const nuvem = ambiente.modo === 'nuvem';
  return (
    <div className={css.app}>
      <aside className={[css.menu, aberto ? css.menuAberto : ''].join(' ')} aria-label="Menu principal">
        <NavLink to="/" className={css.marca}>
          <img src="/favicon.svg" alt="" />
          <span>
            <b>Aragonez Builder</b>
            <small>Layouts sociais</small>
          </span>
        </NavLink>
        <nav className={css.nav}>
          {ITENS.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              end={i.para === '/'}
              className={({ isActive }) => [css.link, isActive ? css.ativo : ''].join(' ')}
            >
              <Icone nome={i.icone} />
              {i.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className={css.rodape}>
          <div className={css.modo} data-testid="modo-dados">
            <span className={[css.ponto, nuvem ? css.nuvem : ''].join(' ')} />
            <span>
              <b>{nuvem ? 'Nuvem conectada' : 'Modo local'}</b>
              {nuvem ? 'Projetos salvos na sua conta.' : 'Sem login: os dados ficam neste navegador.'}
            </span>
          </div>
        </div>
      </aside>
      <div>
        <header className={css.topoCelular}>
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            icone="menu"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
          />
          <b>Aragonez Builder</b>
          <span style={{ width: 36 }} />
        </header>
        <main className={css.principal} id="conteudo">
          <AvisosDoBanco />
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
