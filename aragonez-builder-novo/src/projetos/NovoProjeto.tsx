import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { carregarCatalogo, criarProjeto, type Catalogo } from '@/dados/catalogo';
import { repo } from '@/dados/repositorio';
import { Botao } from '@/ui/Botao';
import { Dialogo } from '@/ui/Dialogo';
import { avisar } from '@/ui/toast';
import { Miniatura } from './Miniatura';
import css from './Projetos.module.css';

/** Novo projeto: escolher o layout, o Brand Kit e o nome. O projeto é salvo e abre no editor. */
export function NovoProjeto({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navegar = useNavigate();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [layoutId, setLayoutId] = useState('');
  const [kitId, setKitId] = useState('');
  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    void carregarCatalogo().then((c) => {
      const visiveis = { ...c, layouts: c.layouts.filter((l) => l.status !== 'arquivado') };
      setCatalogo(visiveis);
      const inicial = visiveis.layouts.find((l) => l.tiposDeSlide.some((t) => t.camadas.length)) ?? visiveis.layouts[0];
      setLayoutId((atual) => atual || inicial?.id || '');
      // o kit sugerido pelo layout que já vem marcado também vale
      const sugerido =
        inicial?.brandKitId && c.kits.some((k) => k.id === inicial.brandKitId) ? inicial.brandKitId : undefined;
      setKitId((atual) => atual || sugerido || c.kits[0]?.id || '');
    });
  }, [aberto]);
  const layout = catalogo?.layouts.find((l) => l.id === layoutId);
  const kit = catalogo?.kits.find((k) => k.id === kitId);
  const criar = async () => {
    if (!layout || !kit) return;
    setCriando(true);
    try {
      const p = criarProjeto(layout, kit, nome);
      await repo.atual.salvarProjeto(p);
      aoFechar();
      navegar(`/editor/${p.id}`);
    } catch (e) {
      avisar('Não consegui criar o projeto: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setCriando(false);
    }
  };
  return (
    <Dialogo
      aberto={aberto}
      titulo="Novo projeto"
      aoFechar={aoFechar}
      largura={760}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="mais" disabled={!layout || !kit || criando} onClick={criar}>
            Criar e abrir
          </Botao>
        </>
      }
    >
      {!catalogo ? (
        <p aria-busy="true">Carregando layouts…</p>
      ) : (
        <div className={css.novo}>
          <label className={css.campo}>
            Nome do projeto
            <input
              value={nome}
              placeholder={layout?.nome ?? 'Meu carrossel'}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </label>
          <fieldset className={css.escolha}>
            <legend>Layout</legend>
            <div className={css.layouts}>
              {catalogo.layouts.map((l) => (
                <label key={l.id} className={[css.layout, l.id === layoutId ? css.escolhido : ''].join(' ')}>
                  <input
                    type="radio"
                    name="layout"
                    value={l.id}
                    checked={l.id === layoutId}
                    onChange={() => {
                      setLayoutId(l.id);
                      // o layout pode sugerir o kit dele (ex.: Victor Aragonez)
                      if (l.brandKitId && catalogo.kits.some((k) => k.id === l.brandKitId)) setKitId(l.brandKitId);
                    }}
                  />
                  {kit && <Miniatura layout={l} kit={kit} largura={128} />}
                  <span>
                    <b>{l.nome}</b>
                    <small>
                      {l.tiposDeSlide.length} {l.tiposDeSlide.length === 1 ? 'tipo de slide' : 'tipos de slide'}
                      {l.continuo ? ' · contínuo' : ''}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className={css.campo}>
            Brand Kit
            <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
              {catalogo.kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </Dialogo>
  );
}
