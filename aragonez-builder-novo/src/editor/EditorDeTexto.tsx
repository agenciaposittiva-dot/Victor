import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { CamadaTexto } from '@/dominio/schemas';
import { editor, useEditor } from './estado';
import { acharCamada, caixaNoDocumento, type Dono } from './operacoes';
import { useDocumento } from './useDocumento';
import { useVista } from './vista';
import css from './Editor.module.css';

/** Edição do texto direto no canvas (duplo clique): uma caixa de texto no lugar da camada, com a mesma fonte e o
 *  mesmo tamanho na tela. Mostra as marcações (*destaque*). Esc desfaz o que foi digitado aqui; clicar fora ou
 *  Ctrl+Enter termina. */
export function EditorDeTexto({
  alvo,
  areaRef,
}: {
  alvo: { dono: Dono; id: string };
  areaRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useEditor((s) => s.doc);
  const { ctx } = useDocumento();
  const { zoom, x, y } = useVista();
  const camada = acharCamada(doc, alvo.dono, alvo.id) as CamadaTexto | undefined;
  const caixa = caixaNoDocumento(doc, alvo.dono, alvo.id, ctx);
  const ref = useRef<HTMLTextAreaElement>(null);
  // como estava tudo ao abrir: Esc volta exatamente a isso (documento e histórico)
  const [antes] = useState(() => editor.capturar());
  const [estilo, setEstilo] = useState<CSSProperties>({});

  // copia a fonte do texto desenhado (já com o tamanho do auto-ajuste)
  useLayoutEffect(() => {
    const raiz = areaRef.current;
    const el = raiz?.querySelector<HTMLElement>(
      alvo.dono === 'faixa'
        ? `[data-faixa] > [data-camada="${alvo.id}"]`
        : `[data-slide="${alvo.dono}"] [data-camada="${alvo.id}"]`,
    );
    const interno = el?.firstElementChild as HTMLElement | null;
    if (!interno) return;
    const cs = getComputedStyle(interno);
    const px = (v: string) => `${parseFloat(v) * zoom}px`;
    setEstilo({
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight as CSSProperties['fontWeight'],
      fontStyle: cs.fontStyle,
      fontSize: px(cs.fontSize),
      lineHeight: cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight),
      letterSpacing: cs.letterSpacing === 'normal' ? 'normal' : px(cs.letterSpacing),
      textTransform: cs.textTransform as CSSProperties['textTransform'],
      textAlign: cs.textAlign as CSSProperties['textAlign'],
    });
  }, [alvo, zoom, areaRef, camada?.texto]); // o auto-ajuste muda o tamanho enquanto se digita

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);

  if (!camada || camada.tipo !== 'texto' || !caixa) return null;
  const mudar = (texto: string) =>
    editor.editar(
      'Editar texto',
      (d) => {
        const c = acharCamada(d.doc, alvo.dono, alvo.id);
        if (c?.tipo === 'texto') c.texto = texto;
      },
      `texto:${alvo.dono}:${alvo.id}`,
    );
  const sair = () => editor.editarTexto(null);
  return (
    <textarea
      ref={ref}
      data-controle
      data-canvas
      data-testid="editor-de-texto"
      aria-label={`Editar ${camada.rotulo ?? 'texto'}`}
      className={css.textoNoCanvas}
      value={camada.texto}
      spellCheck
      style={{
        ...estilo,
        left: x + caixa.x * zoom,
        top: y + caixa.y * zoom,
        width: caixa.w * zoom,
        minHeight: caixa.h * zoom,
        transform: caixa.rotacao ? `rotate(${caixa.rotacao}deg)` : undefined,
      }}
      onChange={(e) => mudar(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={sair}
      onKeyDown={(e) => {
        e.stopPropagation();
        const cmd = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape') {
          e.preventDefault();
          editor.restaurar(antes);
          sair();
        } else if (cmd && e.key.toLowerCase() === 'z') {
          // o desfazer nativo de um campo controlado pelo React briga com o nosso
          e.preventDefault();
          if (e.shiftKey) editor.refazer();
          else editor.desfazer();
        } else if (e.key === 'Enter' && cmd) sair();
      }}
    />
  );
}
