import type { BrandKit, Fonte, Preenchimento } from './schemas';

/** Kit mínimo que o renderizador precisa (o Brand Kit completo serve). */
export type KitTokens = Pick<BrandKit, 'cores' | 'fontes'> & Partial<Pick<BrandKit, 'handle' | 'nome'>>;

const RE_TOKEN_COR = /^\{cores\.([\w-]+)\}(?:\/(\d{1,3}))?$/;
const RE_TOKEN_FONTE = /^\{fontes\.(titulo|corpo|destaque|etiqueta)\}$/;

/** Cor usada quando o token não existe no kit: fácil de notar no preview e no teste. */
export const COR_FALTANDO = '#ff00ff';

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

/** Normaliza #rgb/#rrggbb/#rrggbbaa para #rrggbbaa e aplica uma opacidade extra (0–1). */
export function comOpacidade(hex: string, opacidade: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const base = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return '#' + h.slice(0, 6) + hex2(base * opacidade * 255);
}

/** Resolve uma cor: hex fica como está; {cores.x} vira a cor do kit; {cores.x}/40 aplica 40% de opacidade. */
export function resolverCor(valor: string | undefined, kit: KitTokens): string | undefined {
  if (!valor) return undefined;
  const m = RE_TOKEN_COR.exec(valor);
  if (!m) return valor;
  const cor = kit.cores[m[1] as string] ?? COR_FALTANDO;
  return m[2] !== undefined ? comOpacidade(cor, Math.min(100, Number(m[2])) / 100) : cor;
}

/** Resolve a fonte de uma camada: {fontes.titulo} vira a fonte do kit (destaque e etiqueta caem para o corpo). */
export function resolverFonte(ref: string | undefined, kit: KitTokens): Pick<Fonte, 'familia' | 'peso' | 'italico'> {
  if (!ref)
    return { familia: kit.fontes.corpo.familia, peso: kit.fontes.corpo.peso, italico: kit.fontes.corpo.italico };
  const m = RE_TOKEN_FONTE.exec(ref);
  if (!m) return { familia: ref };
  const f = kit.fontes[m[1] as keyof KitTokens['fontes']] ?? kit.fontes.corpo;
  return { familia: f.familia, peso: f.peso, italico: f.italico };
}

/** Troca {handle} e {nome} pelos valores do kit dentro de um texto. */
export function resolverTexto(texto: string, kit: KitTokens): string {
  return texto.replace(/\{handle\}/g, kit.handle ?? '').replace(/\{nome\}/g, kit.nome ?? '');
}

/** Preenchimento em CSS: cor sólida ou linear-gradient com as cores resolvidas. */
export function resolverPreenchimento(p: Preenchimento | undefined, kit: KitTokens): string | undefined {
  if (!p) return undefined;
  if (typeof p === 'string') return resolverCor(p, kit);
  const paradas = p.paradas.map((s) => `${resolverCor(s.cor, kit)} ${Math.round(s.pos * 1000) / 10}%`).join(', ');
  return `linear-gradient(${p.angulo}deg, ${paradas})`;
}

/** Lista os tokens de cor usados num valor qualquer (para avisar quando o kit não tem a cor). */
export function tokensDeCor(texto: string): string[] {
  return [...texto.matchAll(/\{cores\.([\w-]+)\}/g)].map((m) => m[1] as string);
}
