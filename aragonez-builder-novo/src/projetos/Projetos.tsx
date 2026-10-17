import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { acharKit, acharLayout, type Catalogo } from '@/dados/catalogo';
import { novoId, repo } from '@/dados/repositorio';
import { excluirProjetoEArquivos } from '@/dados/limpeza';
import type { Projeto } from '@/dominio/schemas';
import { baixar } from '@/exportar/arquivos';
import { slug } from '@/exportar/nomes';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { avisar } from '@/ui/toast';
import { Vazio } from '@/ui/Vazio';
import { AvisoFixo } from '@/ui/AvisoFixo';
import { Backup } from './Backup';
import {
  atualizarProjetos,
  carregarProjetos,
  ouvirMudancas,
  removerDaLista,
  useListaDeProjetos,
} from './listaDeProjetos';
import { Miniatura } from './Miniatura';
import { NovoProjeto } from './NovoProjeto';
import css from './Projetos.module.css';

const quando = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

/** Lista de projetos deste navegador: miniatura real, abrir, renomear, duplicar, excluir e buscar. Projetos que
 *  não abrem nem depois da migração aparecem como "precisa de atualização", com o JSON bruto para exportar. */
export function Projetos({
  vazio,
  limite,
}: {
  vazio: { titulo: string; texto: string };
  /** mostra só os N mais recentes, com "Ver todos" (Dashboard). */
  limite?: number;
}) {
  const { itens, catalogo, erro } = useListaDeProjetos();
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);

  useEffect(() => {
    void carregarProjetos();
    return ouvirMudancas();
  }, []);

  const tentar = async (oQue: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      avisar(`Não consegui ${oQue}: ` + (e instanceof Error ? e.message : String(e)), 'erro');
    }
  };
  const duplicar = (p: Projeto) =>
    tentar('duplicar o projeto', async () => {
      const copia = { ...p, id: novoId('p'), nome: `${p.nome} (cópia)` };
      await repo.atual.salvarProjeto(copia);
      avisar('Projeto duplicado.', 'ok');
      await atualizarProjetos([copia.id]);
    });
  const renomear = () =>
    tentar('renomear o projeto', async () => {
      if (!renomeando) return;
      const { id, nome } = renomeando;
      const lido = await repo.atual.lerProjeto(id);
      if (lido?.ok) await repo.atual.salvarProjeto({ ...lido.valor, nome: nome.trim() || lido.valor.nome });
      setRenomeando(null);
      await atualizarProjetos([id]);
    });
  const excluir = () =>
    tentar('excluir o projeto', async () => {
      if (!excluindo) return;
      // os arquivos que só este projeto usava saem junto
      await excluirProjetoEArquivos(repo.atual, excluindo.id);
      removerDaLista(excluindo.id);
      setExcluindo(null);
      avisar('Projeto excluído.', 'ok');
    });

  const termo = busca.trim().toLowerCase();
  const todos = (itens ?? []).filter((i) => !termo || (i.ok ? i.valor.nome : i.nome).toLowerCase().includes(termo));
  const filtrados = limite && !termo ? todos.slice(0, limite) : todos;
  const sobram = todos.length - filtrados.length;

  return (
    <section className={css.projetos} aria-label="Projetos">
      <Backup aoImportar={() => void carregarProjetos()} />
      <div className={css.barra}>
        <label className={css.busca}>
          <Icone nome="busca" tamanho={16} />
          <input
            type="search"
            placeholder="Buscar projeto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar projeto"
          />
        </label>
        <Botao variante="primario" icone="mais" onClick={() => setNovo(true)}>
          Novo projeto
        </Botao>
      </div>
      {erro && (
        <AvisoFixo
          tipo="erro"
          titulo="Não consegui carregar os projetos"
          acoes={
            <Botao tamanho="pequeno" variante="primario" onClick={() => void carregarProjetos()}>
              Tentar de novo
            </Botao>
          }
        >
          {erro}
        </AvisoFixo>
      )}
      {itens === null ? (
        !erro && <p aria-busy="true">Carregando projetos…</p>
      ) : itens.length === 0 ? (
        <Vazio
          icone="painel"
          titulo={vazio.titulo}
          texto={vazio.texto}
          acoes={
            <Botao variante="primario" icone="mais" onClick={() => setNovo(true)}>
              Novo projeto
            </Botao>
          }
        />
      ) : (
        <ul className={css.grade}>
          {filtrados.map((i) =>
            i.ok ? (
              <CartaoProjeto
                key={i.valor.id}
                p={i.valor}
                catalogo={catalogo}
                aoRenomear={() => setRenomeando({ id: i.valor.id, nome: i.valor.nome })}
                aoDuplicar={() => void duplicar(i.valor)}
                aoExcluir={() => setExcluindo({ id: i.valor.id, nome: i.valor.nome })}
              />
            ) : (
              <li key={i.id} className={[css.cartao, css.quebrado].join(' ')} data-testid="projeto-precisa-atualizar">
                <div className={css.miniVazia}>
                  <Icone nome="alerta" tamanho={28} />
                </div>
                <div className={css.info}>
                  <b>{i.nome}</b>
                  <small>Precisa de atualização: este projeto não abre nesta versão do app.</small>
                  <small className={css.erros}>{i.erros.slice(0, 2).join(' · ')}</small>
                </div>
                <div className={css.acoesCartao}>
                  <Botao
                    tamanho="pequeno"
                    variante="fantasma"
                    icone="lixeira"
                    onClick={() => setExcluindo({ id: i.id, nome: i.nome })}
                    aria-label={`Excluir ${i.nome}`}
                  />
                  <Botao
                    tamanho="pequeno"
                    icone="baixar"
                    onClick={() =>
                      baixar(
                        new Blob([JSON.stringify(i.bruto, null, 2)], { type: 'application/json' }),
                        `${slug(i.nome)}-bruto.json`,
                      )
                    }
                  >
                    Exportar JSON
                  </Botao>
                </div>
              </li>
            ),
          )}
          {filtrados.length === 0 && <li className={css.semResultado}>Nenhum projeto com “{busca}”.</li>}
        </ul>
      )}
      {sobram > 0 && (
        <Link to="/editor" className={css.verTodos}>
          Ver todos os {todos.length} projetos
        </Link>
      )}
      <NovoProjeto aberto={novo} aoFechar={() => setNovo(false)} />
      <Dialogo
        aberto={!!excluindo}
        titulo="Excluir projeto?"
        aoFechar={() => setExcluindo(null)}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setExcluindo(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" icone="lixeira" onClick={() => void excluir()}>
              Excluir
            </Botao>
          </>
        }
      >
        <p>“{excluindo?.nome}” some deste navegador. Se tiver um backup (.zip), dá para importar de volta.</p>
      </Dialogo>
      <Dialogo
        aberto={!!renomeando}
        titulo="Renomear projeto"
        aoFechar={() => setRenomeando(null)}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setRenomeando(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={() => void renomear()}>
              Salvar
            </Botao>
          </>
        }
      >
        <label className={css.campo}>
          Nome
          <input
            autoFocus
            value={renomeando?.nome ?? ''}
            onChange={(e) => renomeando && setRenomeando({ ...renomeando, nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void renomear()}
          />
        </label>
      </Dialogo>
    </section>
  );
}

function CartaoProjeto({
  p,
  catalogo,
  aoRenomear,
  aoDuplicar,
  aoExcluir,
}: {
  p: Projeto;
  catalogo: Catalogo | null;
  aoRenomear: () => void;
  aoDuplicar: () => void;
  aoExcluir: () => void;
}) {
  const layout = catalogo && acharLayout(catalogo, p.layoutId);
  const kit = catalogo && acharKit(catalogo, p.brandKitId);
  return (
    <li className={css.cartao}>
      <Link to={`/editor/${p.id}`} className={css.mini} aria-label={`Abrir ${p.nome}`}>
        {layout && kit ? (
          <QuandoVisivel>
            <Miniatura projeto={p} layout={layout} kit={kit} largura={220} />
          </QuandoVisivel>
        ) : (
          <div className={css.miniVazia}>
            <Icone nome="alerta" tamanho={24} />
          </div>
        )}
      </Link>
      <div className={css.info}>
        <Link to={`/editor/${p.id}`} className={css.nome}>
          {p.nome}
        </Link>
        <small>
          {p.slides.length} {p.slides.length === 1 ? 'slide' : 'slides'} · {layout?.nome ?? 'layout não encontrado'} ·{' '}
          {quando(p.atualizadoEm)}
        </small>
      </div>
      <div className={css.acoesCartao}>
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="lapis"
          onClick={aoRenomear}
          aria-label={`Renomear ${p.nome}`}
        />
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="copiar"
          onClick={aoDuplicar}
          aria-label={`Duplicar ${p.nome}`}
        />
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="lixeira"
          onClick={aoExcluir}
          aria-label={`Excluir ${p.nome}`}
        />
      </div>
    </li>
  );
}

/** Desenha o conteúdo só quando ele aparece na tela (miniaturas de listas longas). */
function QuandoVisivel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (visivel || !el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisivel(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visivel]);
  return (
    <div ref={ref} className={css.quandoVisivel}>
      {visivel ? children : null}
    </div>
  );
}
