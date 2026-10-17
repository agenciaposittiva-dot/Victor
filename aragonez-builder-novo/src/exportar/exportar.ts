import { createElement, type ReactElement } from 'react';
import { fatias } from '@/dominio/faixa';
import { montarSlides, type AjustesDaFaixa, type SlideMontado } from '@/dominio/montagem';
import type { Layout, Projeto } from '@/dominio/schemas';
import type { KitTokens } from '@/dominio/tokens';
import type { ContextoRender } from '@/render/contexto';
import { fontesNaoCarregadas, garantirFontes, type UsoDeFonte } from '@/render/fontes';
import { corDeBase } from '@/render/fundoEstilo';
import { Faixa, JanelaDaFaixa, ProvedorRender, Slide } from '@/render/Slide';
import { baixar, canvasParaBlob, criarPdf, criarZip, liberarCanvas } from './arquivos';
import { fontesDosSlides } from './fontesUsadas';
import { capturar, recortar, renderizarFora, type Motor } from './motor';
import { nomeDoSlide, slug } from './nomes';

export type FormatoExportacao = 'jpg' | 'png' | 'pdf' | 'zip';

export type OpcoesExportacao = {
  layout: Layout;
  kit: KitTokens;
  /** conteúdo, ajustes e extras do projeto (slides e faixa). */
  projeto?: Pick<Projeto, 'nome' | 'slides'> & AjustesDaFaixa;
  /** quais slides (padrão: todos). */
  indices?: number[];
  escala?: 1 | 2;
  motor?: Motor;
  /** contínuo: 'por-slide' (padrão) captura janela por janela; 'faixa' captura a faixa inteira e fatia, só para
   *  diagnóstico: o canvas gigante passa do limite de área do iPhone (≈16,7 MP) e sai em branco. */
  estrategia?: 'por-slide' | 'faixa';
  urlDoAsset?: ContextoRender['urlDoAsset'];
  /** chamado antes do primeiro slide (0 de N) e a cada slide pronto ("Exportando 3 de 20"). */
  aoProgredir?: (feitos: number, total: number) => void;
};

export type SlideCapturado = { indice: number; tipo: string; blob: Blob; largura: number; altura: number };

const comProvedor = (op: OpcoesExportacao, filho: ReactElement) =>
  createElement(ProvedorRender, { layout: op.layout, kit: op.kit, urlDoAsset: op.urlDoAsset, children: filho });

/** Slides montados e índices pedidos (sem renderizar nada). */
export function prepararSlides(op: OpcoesExportacao): { slides: SlideMontado[]; indices: number[] } {
  const slides = montarSlides(op.layout, op.projeto);
  const indices = (op.indices ?? slides.map((s) => s.indice)).filter(
    (i, k, a) => i >= 0 && i < slides.length && a.indexOf(i) === k,
  );
  return { slides, indices };
}

/** Carrega as fontes que os slides montados usam (com os ajustes do projeto) e devolve as que não carregaram. */
export async function prepararFontes(
  op: OpcoesExportacao,
  slides: SlideMontado[],
): Promise<{ usos: UsoDeFonte[]; faltando: UsoDeFonte[] }> {
  const usos = fontesDosSlides(op.layout, slides, op.kit, op.projeto);
  await garantirFontes(usos);
  return { usos, faltando: fontesNaoCarregadas(usos) };
}

/** Captura os slides um de cada vez: cada canvas vira arquivo e é liberado antes do próximo, para a memória
 *  não crescer com a quantidade de slides (20 slides em 2× guardados juntos passariam de 450 MB). */
export async function* capturarSlides(
  op: OpcoesExportacao,
  saida: { tipo: 'jpg' | 'png'; qualidade?: number },
): AsyncGenerator<SlideCapturado> {
  const { layout, kit } = op;
  const { w, h } = layout.formato;
  const escala = op.escala ?? 1;
  const { slides, indices } = prepararSlides(op);
  await prepararFontes(op, slides);
  let feitos = 0;
  const progresso = () => op.aoProgredir?.(feitos, indices.length);
  progresso();
  // cor de base de cada slide, pintada por baixo no JPG (no contínuo, slide transparente usa o fundo da faixa)
  const baseDe = (s: SlideMontado) => corDeBase(s.fundo.tipo === 'transparente' ? layout.faixa?.fundo : s.fundo, kit);
  const converter = async (canvas: HTMLCanvasElement, s: SlideMontado): Promise<SlideCapturado> => {
    try {
      const largura = canvas.width;
      const altura = canvas.height;
      const blob = await canvasParaBlob(canvas, saida.tipo, { qualidade: saida.qualidade, fundo: baseDe(s) });
      feitos++;
      progresso();
      return { indice: s.indice, tipo: s.tipo.nome, blob, largura, altura };
    } finally {
      liberarCanvas(canvas);
    }
  };

  if (layout.continuo && op.estrategia === 'faixa') {
    // diagnóstico: captura a faixa com fundo transparente e recorta; cada slide recebe a própria cor de base no JPG
    const { no, desmontar } = await renderizarFora(
      comProvedor(op, createElement(Faixa, { layout, slides, ajustes: op.projeto })),
      slides.length * w,
      h,
    );
    let faixa: HTMLCanvasElement;
    try {
      faixa = await capturar(no, { w: slides.length * w, h, escala, motor: op.motor });
    } finally {
      desmontar();
    }
    try {
      for (const f of fatias(slides.length, w, h, escala)) {
        if (!indices.includes(f.indice)) continue;
        yield await converter(recortar(faixa, f.sx, f.sy, f.sw, f.sh), slides[f.indice]!);
      }
    } finally {
      liberarCanvas(faixa);
    }
    return;
  }

  for (const i of indices) {
    const s = slides[i]!;
    const el = layout.continuo
      ? createElement(JanelaDaFaixa, { layout, slides, indice: i, ajustes: op.projeto })
      : createElement(Slide, { slide: s, w, h, total: slides.length });
    const { no, desmontar } = await renderizarFora(comProvedor(op, el), w, h);
    let canvas: HTMLCanvasElement;
    try {
      canvas = await capturar(no, { w, h, escala, motor: op.motor, fundo: baseDe(s) });
    } finally {
      desmontar();
    }
    yield await converter(canvas, s);
  }
}

export type ArquivoGerado = { nome: string; blob: Blob };
export type ResultadoExportacao = { arquivos: ArquivoGerado[]; fontesFaltando: UsoDeFonte[] };

/** Gera os arquivos no formato pedido. JPG ou PNG de mais de um slide sai em ZIP (baixar vários arquivos soltos
 *  pede permissão no Chrome e o iPhone só baixa o primeiro); separados: true força arquivos soltos. */
export async function gerarArquivos(
  op: OpcoesExportacao & {
    formato: FormatoExportacao;
    qualidade?: number;
    imagemDoZip?: 'jpg' | 'png';
    separados?: boolean;
  },
): Promise<ResultadoExportacao> {
  const nomeProjeto = op.projeto?.nome ?? op.layout.nome;
  const { slides, indices } = prepararSlides(op);
  const { faltando } = await prepararFontes(op, slides);
  const qualidade = op.qualidade ?? 0.92;
  const escala = op.escala ?? 1;
  const nome = (s: SlideCapturado, ext: string) => nomeDoSlide(nomeProjeto, s.indice, s.tipo, ext);

  if (op.formato === 'pdf') {
    const pdf = await criarPdf(op.layout.formato.w * escala, op.layout.formato.h * escala);
    for await (const s of capturarSlides(op, { tipo: 'jpg', qualidade })) await pdf.adicionar(s.blob);
    return { arquivos: [{ nome: `${slug(nomeProjeto)}.pdf`, blob: pdf.finalizar() }], fontesFaltando: faltando };
  }

  const imagem = op.formato === 'zip' ? (op.imagemDoZip ?? 'jpg') : op.formato;
  if (op.formato === 'zip' || (indices.length > 1 && !op.separados)) {
    const zip = await criarZip();
    for await (const s of capturarSlides(op, { tipo: imagem, qualidade })) zip.adicionar(nome(s, imagem), s.blob);
    const sufixo = op.formato === 'zip' ? '' : `-${imagem}`;
    return {
      arquivos: [{ nome: `${slug(nomeProjeto)}${sufixo}.zip`, blob: await zip.finalizar() }],
      fontesFaltando: faltando,
    };
  }

  const arquivos: ArquivoGerado[] = [];
  for await (const s of capturarSlides(op, { tipo: imagem, qualidade }))
    arquivos.push({ nome: nome(s, imagem), blob: s.blob });
  return { arquivos, fontesFaltando: faltando };
}

/** Exporta e baixa. */
export async function exportar(op: Parameters<typeof gerarArquivos>[0]): Promise<ResultadoExportacao> {
  const r = await gerarArquivos(op);
  r.arquivos.forEach((a) => baixar(a.blob, a.nome));
  return r;
}

/** Copia um slide como PNG. Chame direto no clique: o ClipboardItem é criado na hora com a Promise do arquivo
 *  (o Safari recusa se o item for criado depois de um await). */
export function copiarSlide(op: OpcoesExportacao & { indice: number }): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return Promise.reject(new Error('Este navegador não deixa copiar imagens. Use "Baixar".'));
  }
  const arquivo = (async () => {
    for await (const s of capturarSlides({ ...op, indices: [op.indice] }, { tipo: 'png' })) return s.blob;
    throw new Error('Slide não encontrado.');
  })();
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': arquivo })]);
}
