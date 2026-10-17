import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { montarSlides } from '@/dominio/montagem';
import { blobParaDataUrl } from '@/exportar/arquivos';
import {
  capturarSlides,
  copiarSlide,
  exportar,
  gerarArquivos,
  type FormatoExportacao,
  type OpcoesExportacao,
} from '@/exportar/exportar';
import { fontesDosSlides } from '@/exportar/usosDosSlides';
import type { Motor } from '@/exportar/motor';
import { fonteCarregada, garantirFontes, type UsoDeFonte } from '@/render/fontes';
import { Escala, Faixa, JanelaDaFaixa, ProvedorRender } from '@/render/Slide';
import { KIT_TESTE, LAYOUT_TESTE, projetoTeste } from '@/seeds/teste';
import { Botao } from '@/ui/Botao';
import { Cabecalho } from '@/ui/Cabecalho';
import { avisar } from '@/ui/toast';
import { avisarFontes } from '@/ui/avisarFontes';
import Gradientes from './Gradientes';
import css from './Laboratorio.module.css';

type ConferenciaZip = {
  arquivos: { nome: string; largura: number; altura: number; desvio: number; cores: number }[];
  bytes: number;
  ms: number;
  progresso: string[];
};

declare global {
  interface Window {
    __lab?: {
      fontes: () => (UsoDeFonte & { carregada: boolean })[];
      exportarPng: (op: Pick<OpcoesExportacao, 'indices' | 'motor' | 'escala' | 'estrategia'>) => Promise<string[]>;
      conferirZip: (op: Pick<OpcoesExportacao, 'escala' | 'motor'>) => Promise<ConferenciaZip>;
    };
  }
}

/** Exporta e mede o tempo (fora do componente: nada impuro roda durante o render). */
async function exportarMedindo(op: Parameters<typeof exportar>[0]) {
  const t0 = performance.now();
  const resultado = await exportar(op);
  return { resultado, ms: Math.round(performance.now() - t0) };
}

/** Exporta em ZIP pelo caminho real e confere, no navegador, se cada imagem saiu com conteúdo (desvio de
 *  luminância e quantidade de cores numa versão reduzida). Usado pelo teste de 20 slides em 2×. */
async function conferirZip(op: OpcoesExportacao): Promise<ConferenciaZip> {
  const t0 = performance.now();
  const progresso: string[] = [];
  const r = await gerarArquivos({ ...op, formato: 'zip', aoProgredir: (f, t) => progresso.push(`${f}/${t}`) });
  const zipBlob = r.arquivos[0]!.blob;
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(zipBlob);
  const arquivos: ConferenciaZip['arquivos'] = [];
  for (const nome of Object.keys(zip.files).sort()) {
    const img = await createImageBitmap(await zip.files[nome]!.async('blob'));
    const c = document.createElement('canvas');
    c.width = 216;
    c.height = 270;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let soma = 0;
    let soma2 = 0;
    const cores = new Set<number>();
    for (let k = 0; k < d.length; k += 4) {
      const l = 0.2126 * d[k]! + 0.7152 * d[k + 1]! + 0.0722 * d[k + 2]!;
      soma += l;
      soma2 += l * l;
      cores.add(((d[k]! >> 4) << 8) | ((d[k + 1]! >> 4) << 4) | (d[k + 2]! >> 4));
    }
    const n = d.length / 4;
    arquivos.push({
      nome,
      largura: img.width,
      altura: img.height,
      desvio: Math.sqrt(soma2 / n - (soma / n) ** 2),
      cores: cores.size,
    });
    img.close();
    c.width = 0;
    c.height = 0;
  }
  return { arquivos, bytes: zipBlob.size, ms: Math.round(performance.now() - t0), progresso };
}

/** Laboratório de exportação (ferramenta de desenvolvimento): o layout de teste, os dois motores e todos os formatos. */
export default function Laboratorio() {
  const [params] = useSearchParams();
  const real = params.has('real');
  const qtd = Math.min(40, Math.max(1, Number(params.get('slides')) || 3));
  const [motor, setMotor] = useState<Motor>('modern-screenshot');
  const [escala, setEscala] = useState<1 | 2>(1);
  const [estrategia, setEstrategia] = useState<'por-slide' | 'faixa'>('por-slide');
  const [quais, setQuais] = useState<'todos' | 'primeiro'>('todos');
  const [ocupado, setOcupado] = useState('');
  const [fontesProntas, setFontesProntas] = useState(false);
  const layout = LAYOUT_TESTE;
  const projeto = useMemo(() => projetoTeste(qtd), [qtd]);
  const slides = useMemo(() => montarSlides(layout, projeto), [layout, projeto]);
  const usos = useMemo(() => fontesDosSlides(layout, slides, KIT_TESTE), [layout, slides]);
  const { w, h } = layout.formato;
  const base = useMemo(() => ({ layout, kit: KIT_TESTE, projeto }), [layout, projeto]);

  useEffect(() => {
    garantirFontes(usos).then(() => setFontesProntas(true));
  }, [usos]);

  useEffect(() => {
    if (!params.has('teste')) return;
    window.__lab = {
      fontes: () => usos.map((u) => ({ ...u, carregada: fonteCarregada(u) })),
      exportarPng: async (op) => {
        const urls: string[] = [];
        for await (const s of capturarSlides({ ...base, ...op }, { tipo: 'png' }))
          urls.push(await blobParaDataUrl(s.blob));
        return urls;
      },
      conferirZip: (op) => conferirZip({ ...base, ...op }),
    };
  }, [params, base, usos]);

  const opcoes = (): OpcoesExportacao => ({
    ...base,
    motor,
    escala,
    estrategia,
    ...(quais === 'primeiro' && { indices: [0] }),
    aoProgredir: (f, t) => setOcupado(f < t ? `Exportando ${f + 1} de ${t}…` : 'Montando o arquivo…'),
  });

  const rodar = async (formato: FormatoExportacao) => {
    setOcupado('Preparando…');
    try {
      const { resultado: r, ms } = await exportarMedindo({ ...opcoes(), formato });
      avisarFontes(r.fontesFaltando);
      avisar(`${r.arquivos.map((a) => a.nome).join(', ')} pronto em ${ms} ms.`, 'ok');
    } catch (e) {
      avisar('Não consegui exportar: ' + (e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setOcupado('');
    }
  };

  if (params.has('gradientes')) return <Gradientes />;

  if (real) {
    // modo de conferência: cada slide em tamanho real, como referência para o teste de pixels
    return (
      <ProvedorRender layout={layout} kit={KIT_TESTE}>
        <div className={css.real} data-fontes={fontesProntas ? 'prontas' : 'carregando'}>
          {slides.map((s) => (
            <div key={s.indice} data-testid={`real-${s.indice}`} style={{ width: w, height: h }}>
              <JanelaDaFaixa layout={layout} slides={slides} indice={s.indice} />
            </div>
          ))}
        </div>
      </ProvedorRender>
    );
  }

  return (
    <ProvedorRender layout={layout} kit={KIT_TESTE}>
      <Cabecalho
        etiqueta="// Laboratório (desenvolvimento)"
        titulo="Exportação *fiel* ao preview"
        texto="Layout de teste contínuo com brilhos, linha de luz, destaque, auto-ajuste, contorno, sombra, imagem com filtro e componente. Exporte e compare com a tela. Use ?slides=20 para testar carrosséis longos."
      />
      <div className={css.barra}>
        <label className={css.campo}>
          Motor de captura
          <select value={motor} onChange={(e) => setMotor(e.target.value as Motor)}>
            <option value="modern-screenshot">modern-screenshot (padrão)</option>
            <option value="html-to-image">html-to-image</option>
          </select>
        </label>
        <label className={css.campo}>
          Escala
          <select value={escala} onChange={(e) => setEscala(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1× (1080 px)</option>
            <option value={2}>2× (2160 px)</option>
          </select>
        </label>
        <label className={css.campo}>
          Slides
          <select value={quais} onChange={(e) => setQuais(e.target.value as typeof quais)}>
            <option value="todos">Todos ({slides.length})</option>
            <option value="primeiro">Só o primeiro</option>
          </select>
        </label>
        <label className={css.campo}>
          Carrossel contínuo
          <select value={estrategia} onChange={(e) => setEstrategia(e.target.value as typeof estrategia)}>
            <option value="por-slide">Slide a slide (padrão)</option>
            <option value="faixa">Faixa inteira e fatiar (diagnóstico)</option>
          </select>
        </label>
        <div className={css.acoes}>
          {(['zip', 'jpg', 'png', 'pdf'] as const).map((f) => (
            <Botao
              key={f}
              variante={f === 'zip' ? 'primario' : 'secundario'}
              icone="exportar"
              disabled={!!ocupado}
              onClick={() => rodar(f)}
              title={f === 'jpg' || f === 'png' ? 'Com mais de um slide, sai em ZIP' : undefined}
            >
              {f.toUpperCase()}
            </Botao>
          ))}
          <Botao
            variante="fantasma"
            disabled={!!ocupado}
            onClick={() =>
              copiarSlide({ ...base, indice: 0, motor, escala })
                .then(() => avisar('Slide 1 copiado.', 'ok'))
                .catch((e) => avisar(e instanceof Error ? e.message : String(e), 'erro'))
            }
          >
            Copiar slide 1
          </Botao>
        </div>
      </div>
      <div className={css.palco} aria-label="Faixa contínua">
        <Escala escala={0.3} w={w * slides.length} h={h}>
          <Faixa layout={layout} slides={slides} />
        </Escala>
      </div>
      <div className={css.miniaturas}>
        {slides.map((s) => (
          <div key={s.indice} className={css.mini}>
            <Escala escala={0.22} w={w} h={h}>
              <JanelaDaFaixa layout={layout} slides={slides} indice={s.indice} />
            </Escala>
            <span>
              {String(s.indice + 1).padStart(2, '0')} · {s.tipo.nome}
            </span>
          </div>
        ))}
      </div>
      <p className={css.status} role="status" aria-live="polite">
        {ocupado || (fontesProntas ? 'Pronto para exportar.' : 'Carregando fontes…')}
      </p>
    </ProvedorRender>
  );
}
