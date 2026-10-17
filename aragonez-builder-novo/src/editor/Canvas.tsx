import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import { urlDoArquivo, useVersaoArquivos } from '@/dados/arquivos';
import type { Camada } from '@/dominio/schemas';
import { Faixa, ProvedorRender, Slide } from '@/render/Slide';
import { Icone } from '@/ui/Icone';
import { EditorDeTexto } from './EditorDeTexto';
import { enquadrar, registrarEnquadramento } from './enquadramento';
import { editor, useEditor } from './estado';
import { caixaNoDocumento, localizar, listaDo, type Dono } from './operacoes';
import { useDocumento } from './useDocumento';
import { useVista, vista } from './vista';
import css from './Canvas.module.css';

type Alvo = { dono: Dono; id: string };
const toque = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Canvas do editor: a faixa contínua desenhada uma vez só (ou o slide ativo), com zoom e rolagem, e uma camada de
 *  marcações por cima, em pixels de tela (nomes dos slides, divisas, seleção, campos editáveis). */
export function Canvas() {
  // a versão dos arquivos entra no endereço das fotos: foto que termina de carregar depois redesenha sozinha
  const versaoArquivos = useVersaoArquivos();
  const urlDoAsset = useMemo(() => (id: string) => urlDoArquivo(id), [versaoArquivos]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = useRef<HTMLDivElement>(null);
  const mundo = useRef<HTMLDivElement>(null);
  // tamanho real da área: null até a primeira medição (enquadrar com um tamanho provisório deixava o slide fora do centro)
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const { zoom, x, y } = useVista();
  const { efetivo, montados, ctx, kit } = useDocumento();
  const doc = useEditor((s) => s.doc);
  const modo = useEditor((s) => s.modo);
  const ativo = useEditor((s) => s.slideAtivo);
  const selecao = useEditor((s) => s.selecao);
  const editando = useEditor((s) => s.editandoTexto);
  const [sobre, setSobre] = useState<Alvo | null>(null);
  const n = montados.length;
  const { w: W, h: H } = ctx;

  // o desenho só muda quando o documento (ou uma foto) muda: zoom e rolagem não redesenham os slides.
  // No contínuo, trocar de slide também não redesenha (a faixa é a mesma).
  const slideMostrado = ctx.continuo ? null : (montados[ativo] ?? null);
  const desenho = useMemo(
    () => (
      <ProvedorRender layout={efetivo} kit={kit} urlDoAsset={urlDoAsset}>
        {ctx.continuo ? (
          <Faixa layout={efetivo} slides={montados} />
        ) : (
          slideMostrado && <Slide slide={slideMostrado} w={W} h={H} total={n} />
        )}
      </ProvedorRender>
    ),
    [efetivo, kit, urlDoAsset, ctx.continuo, montados, slideMostrado, W, H, n],
  );

  // tamanho da área (para enquadrar)
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    // (o reenquadramento quando a altura muda muito fica no efeito abaixo)
    ro.observe(el);
    setTam({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const origemDoSlide = useCallback((i: number) => (ctx.continuo ? i * W : 0), [ctx.continuo, W]);

  useEffect(() => {
    if (!tam) return;
    registrarEnquadramento((o) => {
      const s = useEditor.getState().slideAtivo;
      if (o === 'tudo') return vista.enquadrar({ x: 0, y: 0, w: ctx.continuo ? n * W : W, h: H }, tam);
      if (o === 'centralizar') {
        const { zoom: z } = useVista.getState();
        return vista.definir({ x: tam.w / 2 - (origemDoSlide(s) + W / 2) * z, y: tam.h / 2 - (H / 2) * z });
      }
      vista.enquadrar({ x: origemDoSlide(s), y: 0, w: W, h: H }, tam);
    });
    return () => registrarEnquadramento(null);
  }, [tam, ctx.continuo, n, W, H, origemDoSlide]);

  // primeiro enquadramento só depois da primeira medição real. Depois, só no celular a mudança de altura
  // reenquadra (o canvas encolhe e fica fixo no topo com um campo focado, e volta ao desfocar); no computador,
  // redimensionar a janela mantém o zoom que a pessoa escolheu.
  const alturaEnquadrada = useRef(0);
  useEffect(() => {
    if (!tam || tam.w < 50 || tam.h < 50) return;
    const antes = alturaEnquadrada.current;
    const celular = typeof matchMedia === 'function' && matchMedia('(max-width: 860px)').matches;
    if (antes && (!celular || Math.abs(tam.h - antes) / antes < 0.2)) return;
    alturaEnquadrada.current = tam.h;
    enquadrar('slide');
  }, [tam]);

  // roda do mouse: rolar; com Ctrl/⌘ (ou pinça no trackpad), zoom no ponto do ponteiro
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) vista.zoomEm(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else {
        const v = useVista.getState();
        vista.definir({ x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) });
      }
    };
    // Safari: a pinça no trackpad do Mac (e no iPhone) chega como gesture*, com e.scale; sem preventDefault a
    // página inteira amplia
    type Gesto = Event & { scale: number; clientX: number; clientY: number };
    let escalaAnterior = 1;
    const gestoInicio = (e: Event) => {
      e.preventDefault();
      escalaAnterior = 1;
    };
    const gestoMuda = (e: Event) => {
      e.preventDefault();
      const g = e as Gesto;
      const r = el.getBoundingClientRect();
      vista.zoomEm(
        g.scale / escalaAnterior,
        (g.clientX ?? r.left + r.width / 2) - r.left,
        (g.clientY ?? r.top + r.height / 2) - r.top,
      );
      escalaAnterior = g.scale;
    };
    const gestoFim = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', roda, { passive: false });
    el.addEventListener('gesturestart', gestoInicio, { passive: false });
    el.addEventListener('gesturechange', gestoMuda, { passive: false });
    el.addEventListener('gestureend', gestoFim, { passive: false });
    return () => {
      el.removeEventListener('wheel', roda);
      el.removeEventListener('gesturestart', gestoInicio);
      el.removeEventListener('gesturechange', gestoMuda);
      el.removeEventListener('gestureend', gestoFim);
    };
  }, []);

  /** Camada sob o ponteiro: a mais interna que existe no documento (camadas de dentro de componentes não contam).
   *  No Modo Conteúdo, só campos editáveis. */
  const alvoNoPonto = useCallback((cx: number, cy: number): Alvo | null => {
    const m = mundo.current;
    if (!m) return null;
    const d = useEditor.getState().doc;
    for (const el of document.elementsFromPoint(cx, cy)) {
      if (!m.contains(el)) continue;
      const slideEl = el.closest('[data-slide]');
      const dono: Dono = slideEl && m.contains(slideEl) ? Number(slideEl.getAttribute('data-slide')) : 'faixa';
      const lista = listaDo(d, dono);
      let e: Element | null = el.closest('[data-camada]');
      while (e && m.contains(e)) {
        const id = e.getAttribute('data-camada')!;
        const loc = localizar(lista, id);
        if (loc && !loc.camada.oculta && loc.camada.editavel && loc.camada.tipo !== 'grupo') return { dono, id };
        e = e.parentElement?.closest('[data-camada]') ?? null;
      }
    }
    return null;
  }, []);

  const slideNoPonto = (cx: number) => {
    const r = area.current!.getBoundingClientRect();
    const docX = (cx - r.left - useVista.getState().x) / useVista.getState().zoom;
    return ctx.continuo ? Math.floor(docX / W) : ativo;
  };

  // arrastar com o espaço apertado, com o botão do meio ou (no Modo Conteúdo) num lugar vazio: rolar a vista.
  // Dois dedos: pinça para zoom.
  const espaco = useRef(false);
  useEffect(() => {
    const baixo = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      // fora de campo: a página não rola e o botão focado não é acionado
      e.preventDefault();
      espaco.current = true;
    };
    const cima = (e: KeyboardEvent) => e.code === 'Space' && (espaco.current = false);
    // soltar o espaço em outra janela não pode deixar o espaço "preso"
    const zerar = () => (espaco.current = false);
    const aoEsconder = () => document.visibilityState === 'hidden' && zerar();
    window.addEventListener('keydown', baixo);
    window.addEventListener('keyup', cima);
    window.addEventListener('blur', zerar);
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      window.removeEventListener('keydown', baixo);
      window.removeEventListener('keyup', cima);
      window.removeEventListener('blur', zerar);
      document.removeEventListener('visibilitychange', aoEsconder);
    };
  }, []);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const arraste = useRef<{ x: number; y: number; vx: number; vy: number; moveu: boolean; alvo: Alvo | null } | null>(
    null,
  );
  const pinca = useRef<{ dist: number } | null>(null);

  const aoApertar = (e: PE<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-controle]')) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    area.current?.setPointerCapture(e.pointerId);
    if (ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      pinca.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
      arraste.current = null;
      return;
    }
    const v = useVista.getState();
    const alvo = e.button === 0 && !espaco.current ? alvoNoPonto(e.clientX, e.clientY) : null;
    arraste.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, moveu: false, alvo };
  };
  const aoMover = (e: PE<HTMLDivElement>) => {
    if (ponteiros.current.has(e.pointerId)) ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca.current && ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = area.current!.getBoundingClientRect();
      vista.zoomEm(dist / pinca.current.dist, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
      pinca.current.dist = dist;
      return;
    }
    const a = arraste.current;
    if (!a) {
      if (e.pointerType === 'mouse') {
        const alvo = alvoNoPonto(e.clientX, e.clientY);
        setSobre((s) => (s?.id === alvo?.id && s?.dono === alvo?.dono ? s : alvo));
      }
      return;
    }
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.moveu && Math.hypot(dx, dy) < 4) return;
    a.moveu = true;
    vista.definir({ x: a.vx + dx, y: a.vy + dy });
  };
  const aoSoltar = (e: PE<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId);
    if (ponteiros.current.size < 2) pinca.current = null;
    const a = arraste.current;
    arraste.current = null;
    if (!a || a.moveu) return;
    // clique sem arrastar: escolhe o campo (ou o slide)
    if (a.alvo) {
      // o campo é focado na hora, ainda dentro do toque: o iPhone só abre o teclado com focus() no próprio toque
      // (o campo do slide ativo já está no painel; ao trocar de slide, o próximo toque no campo abre o teclado)
      const campo = document.getElementById(`campo-${a.alvo.dono}-${a.alvo.id}`);
      editor.selecionar({ dono: a.alvo.dono, ids: [a.alvo.id] });
      if (a.alvo.dono !== 'faixa') editor.ativarSlide(a.alvo.dono);
      campo?.focus({ preventScroll: false });
      campo?.scrollIntoView({ block: 'nearest' });
    } else {
      const i = slideNoPonto(e.clientX);
      if (i >= 0 && i < n) editor.ativarSlide(i);
      editor.selecionar({ dono: i >= 0 && i < n ? i : ativo, ids: [] });
    }
  };
  const aoClicarDuasVezes = (e: React.MouseEvent) => {
    const alvo = alvoNoPonto(e.clientX, e.clientY);
    if (!alvo) return;
    const c = localizar(listaDo(useEditor.getState().doc, alvo.dono), alvo.id)?.camada;
    if (c?.tipo !== 'texto') return;
    // em aparelho de toque, a caixa no canvas ficaria com a fonte do zoom (pequena demais): edita pelo campo do painel
    if (toque()) document.getElementById(`campo-${alvo.dono}-${alvo.id}`)?.focus();
    else editor.editarTexto(alvo);
  };

  // marcações em pixels de tela
  const tela = (r: { x: number; y: number; w: number; h: number }) => ({
    left: x + r.x * zoom,
    top: y + r.y * zoom,
    width: r.w * zoom,
    height: r.h * zoom,
  });
  const quadro = (alvo: Alvo, classe: string | undefined, rotulo?: string) => {
    const c = caixaNoDocumento(doc, alvo.dono, alvo.id, ctx);
    if (!c) return null;
    return (
      <div
        key={`${classe}-${alvo.dono}-${alvo.id}`}
        className={classe}
        style={{ ...tela(c), transform: c.rotacao ? `rotate(${c.rotacao}deg)` : undefined }}
      >
        {rotulo && <span className={css.rotuloCampo}>{rotulo}</span>}
      </div>
    );
  };
  const nomeDoCampo = (alvo: Alvo) => {
    const c: Camada | undefined = localizar(listaDo(doc, alvo.dono), alvo.id)?.camada;
    return c?.rotulo ?? c?.nome ?? (c?.tipo === 'texto' ? 'Texto' : 'Imagem');
  };
  const slidesNaTela = ctx.continuo ? montados : montados[ativo] ? [montados[ativo]!] : [];

  return (
    <div
      ref={area}
      className={css.area}
      data-testid="canvas"
      data-modo={modo}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onPointerLeave={() => setSobre(null)}
      onDoubleClick={aoClicarDuasVezes}
      role="region"
      aria-label="Canvas do slide"
    >
      <div
        ref={mundo}
        className={css.mundo}
        style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})`, width: ctx.continuo ? n * W : W, height: H }}
      >
        {desenho}
      </div>
      <div className={css.marcas} aria-hidden="true">
        {slidesNaTela.map((s) => (
          <div
            key={s.indice}
            className={[css.slide, s.indice === ativo ? css.slideAtivo : ''].join(' ')}
            style={tela({ x: origemDoSlide(s.indice), y: 0, w: W, h: H })}
          >
            <span className={css.nomeSlide}>
              {String(s.indice + 1).padStart(2, '0')} · {s.tipo.nome}
            </span>
          </div>
        ))}
        {sobre &&
          !(selecao.ids.includes(sobre.id) && selecao.dono === sobre.dono) &&
          quadro(sobre, css.sobre, nomeDoCampo(sobre))}
        {selecao.ids.map((id) =>
          quadro({ dono: selecao.dono, id }, css.selecionado, nomeDoCampo({ dono: selecao.dono, id })),
        )}
      </div>
      {editando && (
        <>
          {/* enquanto edita, a camada desenhada embaixo fica escondida (sem texto duplicado) */}
          <style>
            {editando.dono === 'faixa'
              ? `[data-faixa] > [data-camada="${CSS.escape(editando.id)}"] { visibility: hidden; }`
              : `[data-slide="${editando.dono}"] [data-camada="${CSS.escape(editando.id)}"] { visibility: hidden; }`}
          </style>
          <EditorDeTexto alvo={editando} areaRef={area} />
        </>
      )}
      <div className={css.zoom} data-controle>
        <button
          type="button"
          onClick={() => vista.zoomEm(1 / 1.25, (tam?.w ?? 0) / 2, (tam?.h ?? 0) / 2)}
          aria-label="Diminuir zoom"
        >
          <Icone nome="menos" tamanho={16} />
        </button>
        <button
          type="button"
          className={css.porcentagem}
          onClick={() => enquadrar('slide')}
          title="Ajustar ao slide (Shift+1)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => vista.zoomEm(1.25, (tam?.w ?? 0) / 2, (tam?.h ?? 0) / 2)}
          aria-label="Aumentar zoom"
        >
          <Icone nome="mais" tamanho={16} />
        </button>
        <button type="button" onClick={() => enquadrar('slide')} aria-label="Ajustar ao slide">
          <Icone nome="ajustar" tamanho={16} />
        </button>
      </div>
    </div>
  );
}
