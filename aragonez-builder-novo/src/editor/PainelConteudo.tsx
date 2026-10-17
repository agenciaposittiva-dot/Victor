import { useRef, useState } from 'react';
import { enviarFoto, ImagemIlegivel, urlDoArquivo, useVersaoArquivos } from '@/dados/arquivos';
import { semDestaque } from '@/dominio/destaque';
import type { Camada, CamadaImagem, CamadaTexto } from '@/dominio/schemas';
import { Botao } from '@/ui/Botao';
import { Icone } from '@/ui/Icone';
import { avisar } from '@/ui/toast';
import { editor, useEditor } from './estado';
import { acharCamada, type Dono } from './operacoes';
import css from './Editor.module.css';

type Campo = { dono: Dono; camada: CamadaTexto | CamadaImagem };

/** Campos editáveis de uma lista de camadas (dentro de grupos também), na ordem. */
function camposDe(camadas: Camada[], dono: Dono, r: Campo[] = []): Campo[] {
  for (const c of camadas) {
    if (c.tipo === 'grupo') camposDe(c.filhos, dono, r);
    else if (c.editavel && !c.oculta && (c.tipo === 'texto' || c.tipo === 'imagem' || c.tipo === 'logo'))
      r.push({ dono, camada: c });
  }
  return r;
}

const rotulo = (c: Camada) => c.rotulo ?? c.nome ?? (c.tipo === 'texto' ? 'Texto' : 'Imagem');

/** Modo Conteúdo: só os campos editáveis do slide ativo (e da faixa contínua), sem mexer no design. */
export function PainelConteudo() {
  const doc = useEditor((s) => s.doc);
  const ativo = useEditor((s) => s.slideAtivo);
  const layout = useEditor((s) => s.layout);
  const selecao = useEditor((s) => s.selecao);
  const slide = doc.slides[ativo];
  if (!slide || !layout) return null;
  const tipo = layout.tiposDeSlide.find((t) => t.id === slide.tipoId);
  const campos = camposDe(slide.camadas, ativo);
  const camposFaixa = layout.continuo ? camposDe(doc.faixa, 'faixa') : [];
  const n = doc.slides.length;
  const sel = (c: Campo) => selecao.dono === c.dono && selecao.ids.includes(c.camada.id);
  return (
    <div className={css.conteudo}>
      <header className={css.cabecalhoPainel}>
        <button
          type="button"
          onClick={() => editor.ativarSlide(ativo - 1)}
          disabled={ativo === 0}
          aria-label="Slide anterior"
        >
          <Icone nome="voltar" tamanho={18} />
        </button>
        <div>
          <span className="etiqueta">
            Slide {String(ativo + 1).padStart(2, '0')} de {String(n).padStart(2, '0')}
          </span>
          <b>{tipo?.nome ?? slide.tipoId}</b>
        </div>
        <button
          type="button"
          onClick={() => editor.ativarSlide(ativo + 1)}
          disabled={ativo >= n - 1}
          aria-label="Próximo slide"
        >
          <Icone nome="avancar" tamanho={18} />
        </button>
      </header>
      {campos.length === 0 && camposFaixa.length === 0 && (
        <p className={css.semCampos}>Este slide não tem campos editáveis. Use o Modo Design para mudar o layout.</p>
      )}
      <div className={css.campos}>
        {campos.map((c) => (
          <CampoDoSlide key={c.camada.id} campo={c} selecionado={sel(c)} />
        ))}
      </div>
      {camposFaixa.length > 0 && (
        <>
          <h3 className={css.subtitulo}>Faixa contínua</h3>
          <div className={css.campos}>
            {camposFaixa.map((c) => (
              <CampoDoSlide key={c.camada.id} campo={c} selecionado={sel(c)} />
            ))}
          </div>
        </>
      )}
      <p className={css.dica}>
        Dica: <code>*palavra*</code> recebe o destaque do layout. Dê dois cliques no texto do slide para editar ali
        mesmo.
      </p>
    </div>
  );
}

function CampoDoSlide({ campo, selecionado }: { campo: Campo; selecionado: boolean }) {
  return campo.camada.tipo === 'texto' ? (
    <CampoTexto dono={campo.dono} c={campo.camada} selecionado={selecionado} />
  ) : (
    <CampoImagem dono={campo.dono} c={campo.camada} selecionado={selecionado} />
  );
}

const idDoCampo = (dono: Dono, id: string) => `campo-${dono}-${id}`;

function CampoTexto({ dono, c, selecionado }: { dono: Dono; c: CamadaTexto; selecionado: boolean }) {
  const qtd = semDestaque(c.texto).length;
  const passou = c.maxCaracteres !== undefined && qtd > c.maxCaracteres;
  const mudar = (texto: string) =>
    editor.editar(
      'Editar texto',
      (d) => {
        const x = acharCamada(d.doc, dono, c.id);
        if (x?.tipo === 'texto') x.texto = texto;
      },
      `texto:${dono}:${c.id}`,
    );
  const idContador = `${idDoCampo(dono, c.id)}-contador`;
  return (
    <div className={[css.campo, selecionado ? css.campoAtivo : ''].join(' ')}>
      <span className={css.rotulo}>
        {/* o campo é rotulado só pelo nome; o contador fica na descrição (aria-describedby) */}
        <label htmlFor={idDoCampo(dono, c.id)}>{rotulo(c)}</label>
        {c.maxCaracteres !== undefined && (
          <small id={idContador} className={passou ? css.passou : ''}>
            {qtd}/{c.maxCaracteres}
          </small>
        )}
      </span>
      <textarea
        id={idDoCampo(dono, c.id)}
        value={c.texto}
        rows={Math.min(8, Math.max(2, c.texto.split('\n').length + 1))}
        aria-invalid={passou || undefined}
        aria-describedby={c.maxCaracteres !== undefined ? idContador : undefined}
        onFocus={() => editor.selecionar({ dono, ids: [c.id] })}
        onChange={(e) => mudar(e.target.value)}
        // campo ligado ao documento: Ctrl/⌘+Z vai para o desfazer do editor (o nativo brigaria com o nosso)
        data-historico
      />
      {/* só o aviso de passar do limite é anunciado (o contador anunciaria a cada letra) */}
      {/* vazio, fica escondido só visualmente (sr-only, sem linha em branco no campo); display: none atrapalharia o anúncio */}
      <small className={passou ? css.passou : 'sr-only'} aria-live="polite">
        {passou ? `Passou ${qtd - c.maxCaracteres!} caracteres do tamanho previsto no layout.` : ''}
      </small>
    </div>
  );
}

function CampoImagem({ dono, c, selecionado }: { dono: Dono; c: CamadaImagem; selecionado: boolean }) {
  useVersaoArquivos();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const url = (c.assetId ? urlDoArquivo(c.assetId) : undefined) || c.url;
  const alterar = (rot: string, f: (x: CamadaImagem) => void, chave?: string) =>
    editor.editar(
      rot,
      (d) => {
        const x = acharCamada(d.doc, dono, c.id);
        if (x && (x.tipo === 'imagem' || x.tipo === 'logo')) f(x);
      },
      chave,
    );
  const enviar = async (f: File | undefined) => {
    if (!f) return;
    setEnviando(true);
    try {
      const id = await enviarFoto(f);
      // só a referência (assetId) entra no documento; ela vale antes da url do layout
      alterar('Trocar foto', (x) => {
        x.assetId = id;
        delete x.url; // a foto do layout não fica de reserva
        x.foco = { x: 0.5, y: 0.5 };
        delete x.zoom;
      });
    } catch (e) {
      avisar(
        e instanceof ImagemIlegivel
          ? e.message
          : 'Não consegui usar esta foto: ' + (e instanceof Error ? e.message : String(e)),
        'erro',
      );
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };
  const foco = c.foco ?? { x: 0.5, y: 0.5 };
  return (
    <div className={[css.campo, selecionado ? css.campoAtivo : ''].join(' ')}>
      <span className={css.rotulo}>{rotulo(c)}</span>
      <div className={css.foto}>
        {url ? (
          <img src={url} alt="" style={{ objectPosition: `${foco.x * 100}% ${foco.y * 100}%` }} />
        ) : (
          <span className={css.semFoto}>{c.placeholder ?? 'Sem foto'}</span>
        )}
      </div>
      <div className={css.linhaBotoes}>
        <Botao
          id={idDoCampo(dono, c.id)}
          tamanho="pequeno"
          icone="imagem"
          disabled={enviando}
          onFocus={() => editor.selecionar({ dono, ids: [c.id] })}
          onClick={() => entrada.current?.click()}
        >
          {enviando ? 'Enviando…' : url ? 'Trocar foto' : 'Escolher foto'}
        </Botao>
        {(c.assetId || c.url) && (
          <Botao
            tamanho="pequeno"
            variante="fantasma"
            onClick={() =>
              alterar('Remover foto', (x) => {
                delete x.assetId;
                delete x.url;
              })
            }
          >
            Remover
          </Botao>
        )}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          aria-label={`Foto: ${rotulo(c)}`}
          onChange={(e) => void enviar(e.target.files?.[0])}
        />
      </div>
      {url && (
        <div className={css.ajustesFoto}>
          <label>
            Zoom
            <input
              data-historico
              type="range"
              min={1}
              max={5}
              step={0.05}
              value={c.zoom ?? 1}
              onChange={(e) =>
                alterar('Zoom da foto', (x) => void (x.zoom = Number(e.target.value)), `zoom:${dono}:${c.id}`)
              }
            />
          </label>
          <label>
            Enquadrar ↔
            <input
              data-historico
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={foco.x}
              onChange={(e) =>
                alterar(
                  'Enquadrar foto',
                  (x) => void (x.foco = { ...foco, x: Number(e.target.value) }),
                  `foco:${dono}:${c.id}`,
                )
              }
            />
          </label>
          <label>
            Enquadrar ↕
            <input
              data-historico
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={foco.y}
              onChange={(e) =>
                alterar(
                  'Enquadrar foto',
                  (x) => void (x.foco = { ...foco, y: Number(e.target.value) }),
                  `foco:${dono}:${c.id}`,
                )
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
