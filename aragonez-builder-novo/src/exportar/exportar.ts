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
import {
  arquivosDosSlides,
  fontesDosSlides,
  problemasDoKit,
  type FotoDeExemplo,
  type ImagemVazia,
  type LugarDaImagem,
  type ProblemasDoKit,
  type UsoDeArquivo,
} from './usosDosSlides';
import { capturar, recortar, renderizarFora, type ImagemComErro, type Motor } from './motor';
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
  /** espera os arquivos (fotos) e devolve os ids dos que faltam (sem arquivo ou com erro de leitura). Sem ele,
   *  falta o que urlDoAsset não resolve. */
  garantirArquivos?: (ids: string[]) => Promise<string[]>;
  /** chamado antes do primeiro slide (0 de N) e a cada slide pronto ("Exportando 3 de 20"). */
  aoProgredir?: (feitos: number, total: number) => void;
};

/** Imagem que deveria aparecer e não aparece no arquivo. Da conferência de antes vem com assetId; da captura (a
 *  última barreira), pode vir só com o src de uma imagem que não carregou. */
export type ArquivoFaltando = LugarDaImagem & { assetId?: string; src?: string };

export type SlideCapturado = {
  indice: number;
  tipo: string;
  blob: Blob;
  largura: number;
  altura: number;
  /** imagens que não apareceram na captura deste slide. */
  faltando: ArquivoFaltando[];
};

/** O que a exportação prepara uma vez só (slides montados, fontes, arquivos esperados e conferidos). Quem conferiu
 *  antes passa o preparado para gerarArquivos, que não carrega nada de novo. */
export type Preparado = {
  /** de onde foi feito: só vale para exportar o mesmo projeto, layout, kit e slides (mesmas referências). */
  de: Pick<OpcoesExportacao, 'projeto' | 'layout' | 'kit' | 'indices'>;
  slides: SlideMontado[];
  indices: number[];
  fontesFaltando: UsoDeFonte[];
  arquivos: UsoDeArquivo[];
  faltando: ArquivoFaltando[];
  vazias: ImagemVazia[];
  deExemplo: FotoDeExemplo[];
  problemasDoKit: ProblemasDoKit;
};

/** O que conferir antes de exportar: arquivos que faltam, imagens vazias, o que o kit não tem, as fontes que não
 *  carregaram e, como lembrete, as fotos de exemplo do layout que o projeto não trocou. */
export type Conferencia = Pick<Preparado, 'faltando' | 'vazias' | 'deExemplo' | 'problemasDoKit' | 'fontesFaltando'> & {
  preparado: Preparado;
};

const comProvedor = (op: OpcoesExportacao, filho: ReactElement) =>
  createElement(ProvedorRender, {
    layout: op.layout,
    kit: op.kit,
    urlDoAsset: op.urlDoAsset,
    modo: 'exportacao',
    children: filho,
  });

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

/** Só o que cai nos slides pedidos (o que vale para a faixa inteira, slides: [], fica). */
function nosPedidos<T extends { slides: number[] }>(lista: T[], indices: number[]): T[] {
  return lista.flatMap((u) => {
    if (!u.slides.length) return [u];
    const slides = u.slides.filter((i) => indices.includes(i));
    return slides.length ? [{ ...u, slides }] : [];
  });
}

/** Tudo o que vem antes do primeiro slide, uma vez só: montar, carregar as fontes, esperar os arquivos e conferir o
 *  que vai sair diferente do esperado (sem desenhar nada). */
async function preparar(op: OpcoesExportacao): Promise<Preparado> {
  const { slides, indices } = prepararSlides(op);
  const { arquivos, vazias, deExemplo } = arquivosDosSlides(op.layout, slides, op.kit, op.projeto);
  const ids = [...new Set(arquivos.map((a) => a.assetId))];
  const [fontes, semArquivo] = await Promise.all([
    prepararFontes(op, slides),
    op.garantirArquivos ? op.garantirArquivos(ids).then((f) => new Set(f)) : Promise.resolve(new Set<string>()),
  ]);
  // o que continua sem endereço também falta (sem garantirArquivos, ou se o endereço sumiu)
  for (const id of ids) if (!op.urlDoAsset?.(id)) semArquivo.add(id);
  const kit = problemasDoKit(op.layout, slides, op.kit, op.projeto);
  return {
    de: { projeto: op.projeto, layout: op.layout, kit: op.kit, indices: op.indices },
    slides,
    indices,
    fontesFaltando: fontes.faltando,
    arquivos,
    // uma falta por arquivo e campo, com os slides unidos (a mesma foto em vários slides é um aviso só)
    faltando: juntarFaltas(
      nosPedidos(
        arquivos.filter((a) => semArquivo.has(a.assetId)),
        indices,
      ),
    ),
    vazias: nosPedidos(vazias, indices),
    deExemplo: nosPedidos(deExemplo, indices),
    problemasDoKit: {
      cores: nosPedidos(kit.cores, indices),
      handle: kit.handle && (kit.handle.some((i) => indices.includes(i)) ? kit.handle : null),
    },
  };
}

/** O preparado foi feito para estas opções? (mesmo projeto, layout e kit, pela referência, e os mesmos slides) */
function mesmaOrigem(p: Preparado, op: OpcoesExportacao): boolean {
  const { de } = p;
  const mesmosIndices =
    de.indices === op.indices ||
    (!!de.indices &&
      !!op.indices &&
      de.indices.length === op.indices.length &&
      de.indices.every((i, k) => i === op.indices![k]));
  return de.projeto === op.projeto && de.layout === op.layout && de.kit === op.kit && mesmosIndices;
}

/** Conferência antes de exportar: prepara tudo uma vez (fontes, arquivos e kit) e diz o que falta, o que está
 *  vazio, o que o kit não tem e quais fotos ainda são as de exemplo. Para exportar depois sem preparar de novo,
 *  passe o "preparado" para gerarArquivos ou exportar. */
export async function conferirExportacao(op: OpcoesExportacao): Promise<Conferencia> {
  const preparado = await preparar(op);
  const { faltando, vazias, deExemplo, problemasDoKit: kit, fontesFaltando } = preparado;
  return { faltando, vazias, deExemplo, problemasDoKit: kit, fontesFaltando, preparado };
}

/** Última barreira: imagens que não apareceram no nó capturado (arquivo sem endereço ou imagem que não carregou). */
function faltasNaCaptura(
  no: HTMLElement,
  erros: ImagemComErro[],
  slides: number[],
  prep: Preparado,
): ArquivoFaltando[] {
  const marcados = [...no.querySelectorAll<HTMLElement>('[data-arquivo-faltando]')].map((el) => ({
    asset: el.dataset.arquivoFaltando,
    camada: el.closest<HTMLElement>('[data-camada]')?.dataset.camada,
    src: undefined as string | undefined,
  }));
  return [...marcados, ...erros].flatMap((e) => {
    // o uso deste arquivo nesta captura (pelo id; sem id, pela camada); a janela do contínuo desenha a faixa inteira,
    // então um uso que não cruza estes slides não aparece no arquivo e não conta
    const usos = prep.arquivos.filter((a) => (e.asset ? a.assetId === e.asset : a.camadaId === e.camada));
    const uso =
      usos.find((a) => !a.slides.length || a.slides.some((i) => !slides.length || slides.includes(i))) ??
      (usos.length ? null : undefined);
    if (uso === null) return [];
    // só os slides desta captura por onde a imagem passa (uma foto da faixa aparece em várias janelas); a que vale
    // para a faixa inteira (slides: []) fica assim
    const nos = !uso ? slides : uso.slides.length ? uso.slides.filter((i) => !slides.length || slides.includes(i)) : [];
    if (uso?.slides.length && !nos.length) return [];
    return [
      {
        campo: uso?.campo ?? 'Imagem',
        slides: nos,
        dono: uso?.dono ?? slides[0] ?? 'faixa',
        ...((uso?.camadaId ?? e.camada) ? { camadaId: uso?.camadaId ?? e.camada } : {}),
        ...(e.asset && { assetId: e.asset }),
        ...(!e.asset && e.src && { src: e.src }),
      },
    ];
  });
}

/** Mesmo arquivo (assetId ou src) no mesmo campo: uma falta só. */
export const chaveDaFalta = (f: ArquivoFaltando) => `${f.assetId ?? f.src}|${f.campo}`;
/** Junta as faltas da conferência com as da captura: uma por arquivo e campo, com os slides unidos (cada captura
 *  do contínuo é uma janela da faixa inteira, e uma foto da faixa apareceria uma vez por slide). */
function juntarFaltas(...listas: ArquivoFaltando[][]): ArquivoFaltando[] {
  const juntas = new Map<string, ArquivoFaltando>();
  for (const f of listas.flat()) {
    const ja = juntas.get(chaveDaFalta(f));
    if (!ja) juntas.set(chaveDaFalta(f), { ...f, slides: [...f.slides] });
    // slides: [] (fundo da faixa) vale para todos e continua vazio
    else if (ja.slides.length && f.slides.length)
      ja.slides = [...new Set([...ja.slides, ...f.slides])].sort((a, b) => a - b);
    else ja.slides = [];
  }
  return [...juntas.values()];
}

/** Captura os slides já preparados, um de cada vez: cada canvas vira arquivo e é liberado antes do próximo, para a
 *  memória não crescer com a quantidade de slides (20 slides em 2× guardados juntos passariam de 450 MB). */
async function* capturarPreparados(
  op: OpcoesExportacao,
  prep: Preparado,
  saida: { tipo: 'jpg' | 'png'; qualidade?: number },
): AsyncGenerator<SlideCapturado> {
  const { layout, kit } = op;
  const { w, h } = layout.formato;
  const escala = op.escala ?? 1;
  const { slides, indices } = prep;
  let feitos = 0;
  const progresso = () => op.aoProgredir?.(feitos, indices.length);
  progresso();
  // cor de base de cada slide, pintada por baixo no JPG (no contínuo, slide transparente usa o fundo da faixa)
  const baseDe = (s: SlideMontado) => corDeBase(s.fundo.tipo === 'transparente' ? layout.faixa?.fundo : s.fundo, kit);
  const converter = async (
    canvas: HTMLCanvasElement,
    s: SlideMontado,
    faltando: ArquivoFaltando[],
  ): Promise<SlideCapturado> => {
    try {
      const largura = canvas.width;
      const altura = canvas.height;
      const blob = await canvasParaBlob(canvas, saida.tipo, { qualidade: saida.qualidade, fundo: baseDe(s) });
      feitos++;
      progresso();
      return { indice: s.indice, tipo: s.tipo.nome, blob, largura, altura, faltando };
    } finally {
      liberarCanvas(canvas);
    }
  };

  if (layout.continuo && op.estrategia === 'faixa') {
    // diagnóstico: captura a faixa com fundo transparente e recorta; cada slide recebe a própria cor de base no JPG
    const { no, desmontar, imagensComErro } = await renderizarFora(
      comProvedor(op, createElement(Faixa, { layout, slides, ajustes: op.projeto })),
      slides.length * w,
      h,
    );
    let faixa: HTMLCanvasElement;
    let faltando: ArquivoFaltando[];
    try {
      faltando = faltasNaCaptura(no, imagensComErro, [], prep);
      faixa = await capturar(no, { w: slides.length * w, h, escala, motor: op.motor });
    } finally {
      desmontar();
    }
    try {
      let primeiro = true;
      for (const f of fatias(slides.length, w, h, escala)) {
        if (!indices.includes(f.indice)) continue;
        yield await converter(recortar(faixa, f.sx, f.sy, f.sw, f.sh), slides[f.indice]!, primeiro ? faltando : []);
        primeiro = false;
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
    const { no, desmontar, imagensComErro } = await renderizarFora(comProvedor(op, el), w, h);
    let canvas: HTMLCanvasElement;
    let faltando: ArquivoFaltando[];
    try {
      faltando = faltasNaCaptura(no, imagensComErro, [i], prep);
      canvas = await capturar(no, { w, h, escala, motor: op.motor, fundo: baseDe(s) });
    } finally {
      desmontar();
    }
    yield await converter(canvas, s, faltando);
  }
}

/** Captura os slides um de cada vez (carrega as fontes e espera os arquivos antes do primeiro). */
export async function* capturarSlides(
  op: OpcoesExportacao,
  saida: { tipo: 'jpg' | 'png'; qualidade?: number },
): AsyncGenerator<SlideCapturado> {
  yield* capturarPreparados(op, await preparar(op), saida);
}

export type ArquivoGerado = { nome: string; blob: Blob };
export type ResultadoExportacao = {
  arquivos: ArquivoGerado[];
  fontesFaltando: UsoDeFonte[];
  /** imagens que saíram vazias: as da conferência de antes mais as que falharam na captura. */
  arquivosFaltando: ArquivoFaltando[];
};

/** Gera os arquivos no formato pedido. JPG ou PNG de mais de um slide sai em ZIP (baixar vários arquivos soltos
 *  pede permissão no Chrome e o iPhone só baixa o primeiro); separados: true força arquivos soltos. */
export async function gerarArquivos(
  op: OpcoesExportacao & {
    formato: FormatoExportacao;
    qualidade?: number;
    imagemDoZip?: 'jpg' | 'png';
    separados?: boolean;
  },
  /** o que a conferência já preparou (conferirExportacao): não carrega de novo. */
  preparado?: Preparado,
): Promise<ResultadoExportacao> {
  const nomeProjeto = op.projeto?.nome ?? op.layout.nome;
  // o preparado só vale se foi feito a partir deste mesmo projeto (senão, prepara de novo: nunca exporta a versão
  // de antes de uma edição)
  const prep = preparado && mesmaOrigem(preparado, op) ? preparado : await preparar(op);
  const qualidade = op.qualidade ?? 0.92;
  const escala = op.escala ?? 1;
  const nome = (s: SlideCapturado, ext: string) => nomeDoSlide(nomeProjeto, s.indice, s.tipo, ext);
  const naCaptura: ArquivoFaltando[] = [];
  const capturados = async function* (saida: { tipo: 'jpg' | 'png'; qualidade?: number }) {
    for await (const s of capturarPreparados(op, prep, saida)) {
      naCaptura.push(...s.faltando);
      yield s;
    }
  };
  const resultado = (arquivos: ArquivoGerado[]): ResultadoExportacao => ({
    arquivos,
    fontesFaltando: prep.fontesFaltando,
    arquivosFaltando: juntarFaltas(prep.faltando, naCaptura),
  });

  if (op.formato === 'pdf') {
    const pdf = await criarPdf(op.layout.formato.w * escala, op.layout.formato.h * escala);
    for await (const s of capturados({ tipo: 'jpg', qualidade })) await pdf.adicionar(s.blob);
    return resultado([{ nome: `${slug(nomeProjeto)}.pdf`, blob: pdf.finalizar() }]);
  }

  const imagem = op.formato === 'zip' ? (op.imagemDoZip ?? 'jpg') : op.formato;
  if (op.formato === 'zip' || (prep.indices.length > 1 && !op.separados)) {
    const zip = await criarZip();
    for await (const s of capturados({ tipo: imagem, qualidade })) zip.adicionar(nome(s, imagem), s.blob);
    const sufixo = op.formato === 'zip' ? '' : `-${imagem}`;
    return resultado([{ nome: `${slug(nomeProjeto)}${sufixo}.zip`, blob: await zip.finalizar() }]);
  }

  const arquivos: ArquivoGerado[] = [];
  for await (const s of capturados({ tipo: imagem, qualidade })) arquivos.push({ nome: nome(s, imagem), blob: s.blob });
  return resultado(arquivos);
}

/** Exporta e baixa. */
export async function exportar(
  op: Parameters<typeof gerarArquivos>[0],
  preparado?: Preparado,
): Promise<ResultadoExportacao> {
  const r = await gerarArquivos(op, preparado);
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
