import { BrandKit, Layout, Projeto, validar } from '@/dominio/schemas';

/** Migrações dos dados salvos. Cada registro guarda versaoSchema; ao ler, passa pelas migrações da versão dele
 *  até a atual. Se ainda assim não validar, o registro NÃO some: aparece na lista como "precisa de atualização",
 *  com o JSON bruto disponível para exportar. */
type Bruto = Record<string, unknown>;
type Migracao = (r: Bruto) => Bruto;

export const VERSAO_ATUAL = 1;

const objeto = (v: unknown): v is Bruto => typeof v === 'object' && v !== null && !Array.isArray(v);
const versaoDe = (r: Bruto) => (typeof r.versaoSchema === 'number' ? r.versaoSchema : 0);

/** v0 (antes do versaoSchema) → v1: completa campos que faltam com valores que não mudam o desenho. */
const PROJETO: Record<number, Migracao> = {
  0: (r) => ({
    ...r,
    nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome : 'Projeto sem nome',
    formato: objeto(r.formato) ? r.formato : { w: 1080, h: 1350 },
    slides: Array.isArray(r.slides)
      ? r.slides.map((s, i) => (objeto(s) ? { ...s, id: typeof s.id === 'string' && s.id ? s.id : `s${i + 1}` } : s))
      : r.slides,
    versaoSchema: 1,
  }),
};
const KIT: Record<number, Migracao> = {
  0: (r) => ({
    ...r,
    nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome : 'Kit sem nome',
    cores: objeto(r.cores) ? r.cores : {},
    versaoSchema: 1,
  }),
};
const LAYOUT: Record<number, Migracao> = {
  0: (r) => ({ ...r, nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome : 'Layout sem nome', versaoSchema: 1 }),
};

function migrar(r: unknown, migracoes: Record<number, Migracao>): { valor: unknown; migrado: boolean } {
  if (!objeto(r)) return { valor: r, migrado: false };
  let atual = r;
  let v = versaoDe(atual);
  const inicial = v;
  while (v < VERSAO_ATUAL && migracoes[v]) {
    atual = migracoes[v]!(atual);
    v = versaoDe(atual) > v ? versaoDe(atual) : v + 1;
  }
  return { valor: atual, migrado: v !== inicial };
}

/** Resultado de ler um registro salvo. */
export type Lido<T> =
  { ok: true; valor: T; migrado: boolean } | { ok: false; id: string; nome: string; erros: string[]; bruto: unknown };

function ler<T>(
  schema: Parameters<typeof validar<T>>[0],
  bruto: unknown,
  migracoes: Record<number, Migracao>,
): Lido<T> {
  const { valor, migrado } = migrar(bruto, migracoes);
  const v = validar(schema, valor);
  if (v.ok) return { ok: true, valor: v.valor, migrado };
  const r = objeto(bruto) ? bruto : {};
  return {
    ok: false,
    id: typeof r.id === 'string' ? r.id : '(sem id)',
    nome: typeof r.nome === 'string' && r.nome ? r.nome : 'Sem nome',
    erros: v.erros,
    bruto,
  };
}

export const lerProjetoSalvo = (bruto: unknown) => ler(Projeto, bruto, PROJETO);
export const lerLayoutSalvo = (bruto: unknown) => ler(Layout, bruto, LAYOUT);
export const lerKitSalvo = (bruto: unknown) => ler(BrandKit, bruto, KIT);
