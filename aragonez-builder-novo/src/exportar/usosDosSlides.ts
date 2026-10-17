import { expandirComponente } from '@/dominio/componentes';
import { posicaoNaFaixa } from '@/dominio/faixa';
import { camadasDaFaixa, faixaDoProjeto, type AjustesDaFaixa, type SlideMontado } from '@/dominio/montagem';
import type { Camada, CamadaImagem, Fundo, Layout } from '@/dominio/schemas';
import { tokensDeCor, type KitTokens } from '@/dominio/tokens';
import { resolverTextoCamada } from '@/render/estiloTexto';
import type { UsoDeFonte } from '@/render/fontes';

/** Fontes (família, peso, estilo) que os slides montados realmente usam: inclui os ajustes do projeto
 *  (override de fonte numa camada) e os ajustes dentro de componentes. Carregadas antes de desenhar. */
export function fontesDosSlides(
  layout: Layout,
  slides: SlideMontado[],
  kit: KitTokens,
  ajustesDaFaixa?: AjustesDaFaixa,
): UsoDeFonte[] {
  const usos: UsoDeFonte[] = [];
  const andar = (cs: Camada[], abertos: string[] = []) =>
    cs.forEach((c) => {
      if (c.oculta) return;
      if (c.tipo === 'texto') usos.push(...resolverTextoCamada(c, kit, c.tamanho ?? 48).usos);
      else if (c.tipo === 'grupo') andar(c.filhos, abertos);
      else if (c.tipo === 'componente') {
        const exp = expandirComponente(c, layout.componentes, abertos);
        if (exp) andar(exp.camadas, exp.visitados);
      }
    });
  slides.forEach((s) => andar(s.camadas));
  andar(camadasDaFaixa(layout, slides.length, ajustesDaFaixa));
  const unicos = new Map(usos.map((u) => [`${u.familia}|${u.peso ?? 400}|${u.italico ? 1 : 0}`, u]));
  return [...unicos.values()];
}

/** Onde fica um campo de imagem: dono é o slide (índice) ou a faixa; camadaId é a camada no documento (num
 *  componente, o próprio componente). Fundo não tem camada. "slides" são os slides onde aparece (a partir de 0);
 *  vazio no fundo da faixa, que vale para todos. */
export type LugarDaImagem = { campo: string; slides: number[]; dono: number | 'faixa'; camadaId?: string };
/** Arquivo (foto) usado pelos slides. */
export type UsoDeArquivo = LugarDaImagem & { assetId: string };
/** Imagem sem foto nenhuma (nem arquivo nem url): sai vazia no arquivo exportado. */
export type ImagemVazia = LugarDaImagem;
/** Campo de foto que ainda usa a foto de exemplo do layout (o projeto não trocou): sai assim no post. */
export type FotoDeExemplo = LugarDaImagem;

export const nomeDaImagem = (c: CamadaImagem) => c.rotulo ?? c.nome ?? (c.tipo === 'logo' ? 'Logo' : 'Imagem');

/** Slides que uma camada da faixa (já posicionada) cruza. */
function slidesCruzados(c: Camada, n: number, w: number): number[] {
  const de = Math.max(0, Math.floor(c.x / w));
  const ate = Math.min(n - 1, Math.floor((c.x + c.w - 1) / w));
  return Array.from({ length: Math.max(0, ate - de + 1) }, (_, k) => de + k);
}

type Onde = { slides: number[]; dono: number | 'faixa'; componenteId?: string };

/** Percorre o que os slides montados desenham, no mesmo caminho de fontesDosSlides: as camadas (dentro de grupos e
 *  de componentes também, menos as ocultas), o fundo de cada slide (o montado já traz o fundo do tipo quando o
 *  slide não tem um próprio), as camadas da faixa e o fundo da faixa. Na faixa, a camada visitada é a do projeto
 *  (o mesmo objeto entre uma chamada e outra, para os caches por camada); a posição só decide os slides que ela
 *  cruza (como em camadasDaFaixa). */
function percorrer(
  layout: Layout,
  slides: SlideMontado[],
  ajustesDaFaixa: AjustesDaFaixa | undefined,
  visitar: { camada: (c: Camada, onde: Onde) => void; fundo: (f: Fundo, campo: string, onde: Onde) => void },
) {
  const andar = (cs: Camada[], o: Onde, abertos: string[] = []) =>
    cs.forEach((c) => {
      if (c.oculta) return;
      visitar.camada(c, o);
      if (c.tipo === 'grupo') andar(c.filhos, o, abertos);
      else if (c.tipo === 'componente') {
        const exp = expandirComponente(c, layout.componentes, abertos);
        if (exp) andar(exp.camadas, { ...o, componenteId: o.componenteId ?? c.id }, exp.visitados);
      }
    });
  slides.forEach((s) => {
    visitar.fundo(s.fundo, 'Fundo', { slides: [s.indice], dono: s.indice });
    andar(s.camadas, { slides: [s.indice], dono: s.indice });
  });
  const n = slides.length;
  for (const c of faixaDoProjeto(layout, ajustesDaFaixa))
    andar([c], { slides: slidesCruzados(posicaoNaFaixa(c, n, layout.formato.w), n, layout.formato.w), dono: 'faixa' });
  if (layout.faixa?.fundo) visitar.fundo(layout.faixa.fundo, 'Fundo da faixa', { slides: [], dono: 'faixa' });
}

/** Arquivos (assetId) que os slides montados usam: camadas imagem e logo e os fundos dos slides e da faixa. Lista
 *  também as imagens vazias (nem arquivo nem url) e os campos que ainda têm a foto de exemplo do layout (editável,
 *  sem assetId, com a url do layout). Uma função só para o editor, a miniatura e a exportação.
 *  Os logos e texturas do kit entram na Fase 4a (o kit já vem no parâmetro). */
export function arquivosDosSlides(
  layout: Layout,
  slides: SlideMontado[],
  _kit: KitTokens | null,
  ajustesDaFaixa?: AjustesDaFaixa,
): { arquivos: UsoDeArquivo[]; vazias: ImagemVazia[]; deExemplo: FotoDeExemplo[] } {
  const arquivos: UsoDeArquivo[] = [];
  const vazias: ImagemVazia[] = [];
  const deExemplo: FotoDeExemplo[] = [];
  percorrer(layout, slides, ajustesDaFaixa, {
    camada: (c, o) => {
      if (c.tipo !== 'imagem' && c.tipo !== 'logo') return;
      const lugar = { campo: nomeDaImagem(c), slides: o.slides, dono: o.dono, camadaId: o.componenteId ?? c.id };
      if (c.assetId) arquivos.push({ ...lugar, assetId: c.assetId });
      else if (!c.url) vazias.push(lugar);
      else if (c.editavel) deExemplo.push(lugar);
    },
    fundo: (f, campo, o) => {
      if (f.tipo === 'imagem' && f.assetId)
        arquivos.push({ campo, slides: o.slides, dono: o.dono, assetId: f.assetId });
    },
  });
  return { arquivos, vazias, deExemplo };
}

/** O que o layout pede e o kit não tem: cores (saem em magenta, COR_FALTANDO) e o handle ({handle} sai vazio).
 *  "slides" a partir de 0; vazio quando aparece no fundo da faixa (todos). */
export type ProblemasDoKit = { cores: { cor: string; slides: number[] }[]; handle: number[] | null };

const juntar = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);

/** Tokens de cor e {handle} de uma camada (sem os filhos, que são visitados um a um) ou de um fundo, guardados pela
 *  referência: no editor o immer mantém o mesmo objeto nas camadas que não mudaram, então digitar refaz só a camada
 *  editada (não o JSON de todas a cada letra). */
type UsoDoKit = { cores: string[]; handle: boolean };
const cacheDoKit = new WeakMap<object, UsoDoKit>();
let olhadas = 0;
/** Quantas camadas e fundos o problemasDoKit analisou de verdade (fora do cache): para o teste de desempenho. */
export const estatisticasDoKit = () => ({ olhadas });
function usoDoKit(valor: Camada | Fundo): UsoDoKit {
  let u = cacheDoKit.get(valor);
  if (!u) {
    olhadas++;
    // o texto do campo não conta: só as propriedades de estilo
    const json = JSON.stringify(valor, (k, v) =>
      k === 'texto' || k === 'filhos' || k === 'overrides' ? undefined : v,
    );
    u = { cores: [...new Set(tokensDeCor(json))], handle: 'texto' in valor && valor.texto.includes('{handle}') };
    cacheDoKit.set(valor, u);
  }
  return u;
}

/** Cores pedidas pelos slides montados (textos, destaque, contorno, preenchimentos, gradientes, bordas, sombras,
 *  fundos e brilhos) que o kit não tem, e {handle} usado sem handle no kit. */
export function problemasDoKit(
  layout: Layout,
  slides: SlideMontado[],
  kit: KitTokens,
  ajustesDaFaixa?: AjustesDaFaixa,
): ProblemasDoKit {
  const cores = new Map<string, number[]>();
  let handle: number[] | null = null;
  const conferir = (valor: Camada | Fundo, nos: number[]) => {
    const u = usoDoKit(valor);
    for (const cor of u.cores) if (!(cor in kit.cores)) cores.set(cor, juntar(cores.get(cor) ?? [], nos));
    if (u.handle && !kit.handle) handle = juntar(handle ?? [], nos);
  };
  percorrer(layout, slides, ajustesDaFaixa, {
    camada: (c, o) => conferir(c, o.slides),
    fundo: (f, _campo, o) => conferir(f, o.slides),
  });
  return { cores: [...cores].map(([cor, nos]) => ({ cor, slides: nos })), handle };
}
