import { memo, useMemo, useState } from 'react';
import { urlDoArquivo, useVersaoArquivos } from '@/dados/arquivos';
import type { SlideMontado } from '@/dominio/montagem';
import type { BrandKit, Layout } from '@/dominio/schemas';
import { Escala, ProvedorRender, Slide } from '@/render/Slide';
import { Botao } from '@/ui/Botao';
import { enquadrar } from './enquadramento';
import { editor, useEditor } from './estado';
import { adicionarSlide, duplicarSlide, excluirSlide, moverSlide } from './operacoes';
import { useDocumento } from './useDocumento';
import css from './Editor.module.css';

const ALTURA_MINI = 132;

/** Faixa de slides: miniaturas reais (layout comum) ou abas numeradas (carrossel contínuo: a faixa já está
 *  desenhada uma vez só no canvas, as abas não desenham de novo). Clicar ativa, arrastar reordena. */
export function FaixaDeSlides() {
  const { layout, montados, kit, efetivo } = useDocumento();
  const ativo = useEditor((s) => s.slideAtivo);
  const [menu, setMenu] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const n = montados.length;
  const continuo = !!layout.continuo;

  const ativar = (i: number) => {
    editor.ativarSlide(i);
    if (continuo) requestAnimationFrame(() => enquadrar('centralizar'));
  };
  const soltar = (para: number) => {
    if (arrastando === null || arrastando === para) return;
    const de = arrastando;
    editor.editar('Mover slide', (d) => moverSlide(d.doc, de, para));
    editor.ativarSlide(para);
  };
  const adicionar = (tipoId: string) => {
    setMenu(false);
    let pos = ativo + 1;
    editor.editar('Adicionar slide', (d) => void (pos = adicionarSlide(d.doc, layout, tipoId, ativo + 1)));
    ativar(pos);
  };

  return (
    <nav className={css.faixaSlides} aria-label="Slides">
      <ol className={css.listaSlides}>
        {montados.map((s) => (
          <li
            key={s.indice + ':' + s.tipo.id}
            draggable
            onDragStart={(e) => {
              setArrastando(s.indice);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(s.indice);
            }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              soltar(s.indice);
              setArrastando(null);
            }}
            onDragEnd={() => {
              setArrastando(null);
              setSobre(null);
            }}
            className={[
              sobre === s.indice && arrastando !== s.indice ? css.alvoDeSoltar : '',
              arrastando === s.indice ? css.arrastado : '',
            ].join(' ')}
          >
            <button
              type="button"
              className={[css.itemSlide, s.indice === ativo ? css.itemAtivo : '', continuo ? css.aba : ''].join(' ')}
              aria-current={s.indice === ativo ? 'true' : undefined}
              aria-label={`Slide ${s.indice + 1}: ${s.tipo.nome}`}
              onClick={() => ativar(s.indice)}
            >
              {!continuo && <MiniaturaDoSlide slide={s} layout={efetivo} kit={kit} total={n} />}
              <span className={css.numeroSlide}>
                <b>{String(s.indice + 1).padStart(2, '0')}</b> {s.tipo.nome}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={css.acoesSlides}>
        <div className={css.menuWrap}>
          <Botao
            tamanho="pequeno"
            icone="mais"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-haspopup="menu"
          >
            Slide
          </Botao>
          {menu && (
            <div className={css.menu} role="menu" aria-label="Tipo do slide novo">
              {layout.tiposDeSlide.map((t) => (
                <button key={t.id} type="button" role="menuitem" onClick={() => adicionar(t.id)}>
                  {t.nome}
                </button>
              ))}
            </div>
          )}
        </div>
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="copiar"
          aria-label="Duplicar slide"
          title="Duplicar slide"
          onClick={() => {
            let i = ativo;
            editor.editar('Duplicar slide', (d) => void (i = duplicarSlide(d.doc, ativo)));
            ativar(i);
          }}
        />
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="voltar"
          aria-label="Mover slide para a esquerda"
          title="Mover para a esquerda"
          disabled={ativo === 0}
          onClick={() => {
            editor.editar('Mover slide', (d) => moverSlide(d.doc, ativo, ativo - 1));
            ativar(ativo - 1);
          }}
        />
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="avancar"
          aria-label="Mover slide para a direita"
          title="Mover para a direita"
          disabled={ativo >= n - 1}
          onClick={() => {
            editor.editar('Mover slide', (d) => moverSlide(d.doc, ativo, ativo + 1));
            ativar(ativo + 1);
          }}
        />
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone="lixeira"
          aria-label="Excluir slide"
          title="Excluir slide"
          disabled={n <= 1}
          onClick={() => {
            editor.editar('Excluir slide', (d) => void excluirSlide(d.doc, ativo));
            editor.ativarSlide(Math.min(ativo, n - 2));
          }}
        />
      </div>
    </nav>
  );
}

/** Miniatura de um slide (memorizada: só redesenha o slide que mudou). */
const MiniaturaDoSlide = memo(function MiniaturaDoSlide({
  slide,
  layout,
  kit,
  total,
}: {
  slide: SlideMontado;
  layout: Layout;
  kit: BrandKit;
  total: number;
}) {
  const versao = useVersaoArquivos();
  const url = useMemo(() => (id: string) => urlDoArquivo(id), [versao]); // eslint-disable-line react-hooks/exhaustive-deps
  const { w, h } = layout.formato;
  return (
    <ProvedorRender layout={layout} kit={kit} urlDoAsset={url}>
      <Escala escala={ALTURA_MINI / h} w={w} h={h}>
        <Slide slide={slide} w={w} h={h} total={total} />
      </Escala>
    </ProvedorRender>
  );
});
