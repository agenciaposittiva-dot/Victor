import { memo, useContext, useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { expandirComponente } from '@/dominio/componentes';
import { caminhoLinhaDeLuz } from '@/dominio/faixa';
import type { Camada, CamadaForma, CamadaImagem, CamadaTexto, Gradiente } from '@/dominio/schemas';
import { resolverCor, resolverPreenchimento, type KitTokens } from '@/dominio/tokens';
import { CtxComponentesAbertos, CtxNumeracao, useRender, type Numeracao } from './contexto';
import { resolverTextoCamada } from './estiloTexto';
import { useVersaoFontes } from './fontes';
import { vetorDoGradiente } from './gradiente';
import { ICONES_SLIDE } from './icones';
import { tamanhoQueCabe } from './medida';

/** Caixa absoluta de uma camada (posição, tamanho, rotação e opacidade em px reais). */
function caixa(c: Camada, extra?: CSSProperties): CSSProperties {
  return {
    position: 'absolute',
    left: c.x,
    top: c.y,
    width: c.w,
    height: c.h,
    ...(c.rotacao && { transform: `rotate(${c.rotacao}deg)`, transformOrigin: 'center' }),
    ...(c.opacidade !== undefined && c.opacidade < 1 && { opacity: c.opacidade }),
    ...extra,
  };
}

const sombraCss = (s: CamadaForma['sombra'], kit: KitTokens) =>
  s ? `${s.x}px ${s.y}px ${s.desfoque}px ${resolverCor(s.cor, kit)}` : undefined;

/** Número do slide para {slide}: o próprio slide; nas camadas da faixa, o slide da âncora (ou o primeiro). */
function numeroDoSlide(c: Camada, n: Numeracao): number {
  if (n.indice >= 0) return n.indice + 1;
  if (c.ancora) return c.ancora.slide === 'ultimo' ? n.total : Math.min(c.ancora.slide, n.total - 1) + 1;
  return 1;
}

function Texto({ c }: { c: CamadaTexto }) {
  const { kit } = useRender();
  const versao = useVersaoFontes();
  const numeracao = useContext(CtxNumeracao);
  const max = c.tamanho ?? 48;
  // só textos com {slide}/{total} dependem da posição: os outros não recalculam ao reordenar slides
  const usaNumero = /\{(slide|total)\}/.test(c.texto);
  const slideNum = usaNumero ? numeroDoSlide(c, numeracao) : 0;
  const total = usaNumero ? numeracao.total : 0;
  const res = useMemo(
    () => resolverTextoCamada(c, kit, max, usaNumero ? { slide: slideNum, total } : undefined),
    [c, kit, max, usaNumero, slideNum, total],
  );
  const tamanho = useMemo(
    () =>
      c.autoAjuste
        ? tamanhoQueCabe({
            trechos: res.trechos,
            base: res.base,
            destaque: res.destaque,
            w: c.w,
            h: c.h,
            max,
            min: c.tamanhoMin ?? Math.min(12, max),
            versaoFontes: versao,
          })
        : max,
    [c.autoAjuste, c.w, c.h, c.tamanhoMin, res, max, versao],
  );
  const v = c.alinhamentoV ?? 'top';
  return (
    <div
      data-camada={c.id}
      style={caixa(c, {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: v === 'middle' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start',
      })}
    >
      <div style={{ ...res.base, fontSize: tamanho }}>
        {res.trechos.map((t, i) =>
          t.destaque ? (
            <span key={i} style={res.destaque}>
              {t.texto}
            </span>
          ) : (
            <span key={i}>{t.texto}</span>
          ),
        )}
      </div>
    </div>
  );
}

function Imagem({ c }: { c: CamadaImagem }) {
  const { kit, urlDoAsset } = useRender();
  const url = c.url || (c.assetId ? urlDoAsset?.(c.assetId) : undefined);
  const foco = c.foco ?? { x: 0.5, y: 0.5 };
  const pos = `${foco.x * 100}% ${foco.y * 100}%`;
  const f = c.filtros;
  const filtro = f
    ? [
        f.brilho !== undefined && `brightness(${f.brilho})`,
        f.contraste !== undefined && `contrast(${f.contraste})`,
        f.saturacao !== undefined && `saturate(${f.saturacao})`,
        f.pb && 'grayscale(1)',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  return (
    <div
      data-camada={c.id}
      style={caixa(c, {
        overflow: 'hidden',
        borderRadius: c.raio,
        ...(c.sombra && { boxShadow: sombraCss(c.sombra, kit) }),
      })}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: c.ajuste ?? 'cover',
            objectPosition: pos,
            ...(c.zoom && c.zoom !== 1 && { transform: `scale(${c.zoom})`, transformOrigin: pos }),
            ...(filtro && { filter: filtro }),
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            background:
              'repeating-linear-gradient(135deg, rgba(128,128,128,.16) 0 18px, rgba(128,128,128,.08) 18px 36px)',
            color: 'rgba(128,128,128,.9)',
            font: '500 28px/1.2 system-ui, sans-serif',
            textAlign: 'center',
            padding: 16,
          }}
        >
          {c.placeholder ?? (c.tipo === 'logo' ? 'Logo' : 'Imagem')}
        </div>
      )}
      {c.borda && c.borda.largura > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: c.raio,
            boxShadow: `inset 0 0 0 ${c.borda.largura}px ${resolverCor(c.borda.cor, kit)}`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

/** id único e válido em url(#…): o useId do React traz caracteres como ":" e "«»", que são removidos. */
function useIdSvg(prefixo: string) {
  return prefixo + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

function GradienteSvg({ id, g, kit, w, h }: { id: string; g: Gradiente; kit: KitTokens; w: number; h: number }) {
  const v = vetorDoGradiente(g.angulo, w, h);
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
      {g.paradas.map((p, i) => (
        <stop key={i} offset={p.pos} stopColor={resolverCor(p.cor, kit)} />
      ))}
    </linearGradient>
  );
}

/** Barra de progresso: a parte cheia acompanha slide ÷ total (deitada, ou de cima para baixo se for mais alta). */
function Progresso({ c }: { c: CamadaForma }) {
  const { kit } = useRender();
  const n = useContext(CtxNumeracao);
  const fracao = n.indice >= 0 && n.total > 0 ? (n.indice + 1) / n.total : 1;
  const deitada = c.w >= c.h;
  const raio = c.raioBorda ?? Math.min(c.w, c.h) / 2;
  return (
    <div
      data-camada={c.id}
      style={caixa(c, {
        overflow: 'hidden',
        borderRadius: raio,
        background: resolverCor(c.trilho, kit) ?? 'rgba(128,128,128,.25)',
      })}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: deitada ? c.w * fracao : '100%',
          height: deitada ? '100%' : c.h * fracao,
          borderRadius: raio,
          background: resolverPreenchimento(c.preenchimento, kit) ?? '#ffffff',
        }}
      />
    </div>
  );
}

function Forma({ c }: { c: CamadaForma }) {
  const { kit, formato } = useRender();
  const idGrad = useIdSvg('ab-g');
  if (c.forma === 'progresso') return <Progresso c={c} />;
  if (c.forma === 'retangulo' || c.forma === 'elipse') {
    return (
      <div
        data-camada={c.id}
        style={caixa(c, {
          background: resolverPreenchimento(c.preenchimento, kit),
          borderRadius: c.forma === 'elipse' ? '50%' : c.raioBorda,
          ...(c.borda &&
            c.borda.largura > 0 && { boxShadow: `inset 0 0 0 ${c.borda.largura}px ${resolverCor(c.borda.cor, kit)}` }),
          ...(c.sombra && {
            boxShadow: [
              sombraCss(c.sombra, kit),
              c.borda && c.borda.largura > 0 ? `inset 0 0 0 ${c.borda.largura}px ${resolverCor(c.borda.cor, kit)}` : '',
            ]
              .filter(Boolean)
              .join(', '),
          }),
        })}
      />
    );
  }
  if (c.forma === 'linha') {
    return (
      <div
        data-camada={c.id}
        style={caixa(c, {
          background: resolverPreenchimento(c.preenchimento, kit) ?? resolverCor(c.borda?.cor, kit),
          borderRadius: c.raioBorda ?? c.h / 2,
        })}
      />
    );
  }
  const grad = typeof c.preenchimento === 'object' ? c.preenchimento : null;
  const corSolida = typeof c.preenchimento === 'string' ? resolverCor(c.preenchimento, kit) : undefined;
  if (c.forma === 'linhaDeLuz') {
    const p = c.parametros ?? {};
    const n = Math.max(1, Math.round(c.w / formato.w));
    const d = caminhoLinhaDeLuz(n, formato.w, c.h, {
      inicioX: p.inicioX,
      fimX: p.fimX,
      yMin: p.yMin,
      yMax: p.yMax,
      semente: p.semente,
      pontosPorSlide: p.pontosPorSlide,
      pontos: c.pontos,
    });
    const traco = grad ? `url(#${idGrad})` : (corSolida ?? '#ff5a1f');
    const esp = p.espessura ?? 3;
    // brilho com traços largos e transparentes por baixo (sem filtro: sai igual na exportação)
    return (
      <svg
        data-camada={c.id}
        style={caixa(c, { overflow: 'visible', pointerEvents: 'none' })}
        width={c.w}
        height={c.h}
        viewBox={`0 0 ${c.w} ${c.h}`}
        fill="none"
      >
        {grad && (
          <defs>
            <GradienteSvg id={idGrad} g={grad} kit={kit} w={c.w} h={c.h} />
          </defs>
        )}
        {/* só o traço recebe clique no editor (a caixa da linha cobre a faixa inteira) */}
        <path
          d={d}
          stroke={traco}
          strokeWidth={esp * 12}
          strokeOpacity={0.05}
          strokeLinecap="round"
          style={{ pointerEvents: 'visibleStroke' }}
        />
        <path d={d} stroke={traco} strokeWidth={esp * 5} strokeOpacity={0.12} strokeLinecap="round" />
        <path d={d} stroke={traco} strokeWidth={esp * 2.2} strokeOpacity={0.3} strokeLinecap="round" />
        <path d={d} stroke={traco} strokeWidth={esp} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      data-camada={c.id}
      style={caixa(c, { overflow: 'visible', pointerEvents: 'none' })}
      width={c.w}
      height={c.h}
      viewBox={`0 0 ${c.w} ${c.h}`}
    >
      {grad && (
        <defs>
          <GradienteSvg id={idGrad} g={grad} kit={kit} w={c.w} h={c.h} />
        </defs>
      )}
      <path
        style={{ pointerEvents: 'visiblePainted' }}
        d={c.caminho ?? ''}
        fill={grad ? `url(#${idGrad})` : (corSolida ?? 'none')}
        stroke={c.borda ? resolverCor(c.borda.cor, kit) : undefined}
        strokeWidth={c.borda?.largura}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CamadaComponenteView({ c }: { c: Extract<Camada, { tipo: 'componente' }> }) {
  const { componentes } = useRender();
  const abertos = useContext(CtxComponentesAbertos);
  const exp = expandirComponente(c, componentes, abertos);
  if (!exp) return null;
  return (
    <div data-camada={c.id} style={caixa(c)}>
      <div
        style={{
          position: 'absolute',
          left: exp.deslocX,
          top: exp.deslocY,
          width: exp.componente.w,
          height: exp.componente.h,
          transform: `scale(${exp.escalaX}, ${exp.escalaY})`,
          transformOrigin: '0 0',
        }}
      >
        <CtxComponentesAbertos.Provider value={exp.visitados}>
          <Camadas camadas={exp.camadas} />
        </CtxComponentesAbertos.Provider>
      </div>
    </div>
  );
}

const CamadaView = memo(function CamadaView({ c }: { c: Camada }): ReactNode {
  const { kit } = useRender();
  if (c.oculta) return null;
  switch (c.tipo) {
    case 'texto':
      return <Texto c={c} />;
    case 'imagem':
    case 'logo':
      return <Imagem c={c} />;
    case 'forma':
      return <Forma c={c} />;
    case 'icone':
      return (
        <svg
          data-camada={c.id}
          style={caixa(c)}
          viewBox="0 0 24 24"
          fill="none"
          stroke={resolverCor(c.cor, kit) ?? 'currentColor'}
          strokeWidth={c.traco ?? 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ICONES_SLIDE[c.nome] ?? ICONES_SLIDE.mais} />
        </svg>
      );
    case 'grupo':
      return (
        <div data-camada={c.id} style={caixa(c)}>
          <Camadas camadas={c.filhos} />
        </div>
      );
    case 'componente':
      return <CamadaComponenteView c={c} />;
  }
});

/** Desenha uma lista de camadas na ordem (a primeira fica por baixo). */
export const Camadas = memo(function Camadas({ camadas }: { camadas: Camada[] }) {
  return (
    <>
      {camadas.map((c) => (
        <CamadaView key={c.id} c={c} />
      ))}
    </>
  );
});
