import { useSyncExternalStore } from 'react';

/** Fontes servidas pelo próprio site (pacotes @fontsource). São CSS do mesmo domínio: a exportação consegue
 *  embutir os arquivos e o resultado sai idêntico ao preview, mesmo sem internet. */
type Registro = { css: string; reserva: string; carregar: () => Promise<unknown> };

const REGISTRO: Record<string, Registro> = {
  'Space Grotesk': {
    css: 'Space Grotesk Variable',
    reserva: 'sans-serif',
    carregar: () => import('@fontsource-variable/space-grotesk'),
  },
  'Instrument Serif': {
    css: 'Instrument Serif',
    reserva: 'serif',
    carregar: () =>
      Promise.all([
        import('@fontsource/instrument-serif/400.css'),
        import('@fontsource/instrument-serif/400-italic.css'),
      ]),
  },
  'JetBrains Mono': {
    css: 'JetBrains Mono Variable',
    reserva: 'monospace',
    carregar: () => import('@fontsource-variable/jetbrains-mono'),
  },
  Montserrat: {
    css: 'Montserrat Variable',
    reserva: 'sans-serif',
    carregar: () =>
      Promise.all([
        import('@fontsource-variable/montserrat/wght.css'),
        import('@fontsource-variable/montserrat/wght-italic.css'),
      ]),
  },
};

export const FONTES_LOCAIS = Object.keys(REGISTRO);

/** Valor de font-family para o CSS: o nome registrado primeiro, depois o nome comum e a reserva genérica. */
export function familiaCss(familia: string): string {
  const r = REGISTRO[familia];
  return r ? `"${r.css}", "${familia}", ${r.reserva}` : `"${familia}", sans-serif`;
}

export type UsoDeFonte = { familia: string; peso?: number; italico?: boolean };

const carregadas = new Map<string, Promise<unknown>>();
let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = () => {
  versao++;
  ouvintes.forEach((f) => f());
};

/** Carrega as famílias usadas e espera os arquivos de cada peso/estilo ficarem prontos para desenhar. */
export async function garantirFontes(usos: UsoDeFonte[]): Promise<void> {
  if (typeof document === 'undefined') return;
  const familias = [...new Set(usos.map((u) => u.familia))];
  await Promise.all(
    familias.map((f) => {
      const r = REGISTRO[f];
      if (!r) return null;
      if (!carregadas.has(f))
        carregadas.set(
          f,
          r.carregar().catch(() => null),
        );
      return carregadas.get(f);
    }),
  );
  const unicos = new Map(usos.map((u) => [`${u.familia}|${u.peso ?? 400}|${u.italico ? 1 : 0}`, u]));
  await Promise.all(
    [...unicos.values()].map((u) =>
      document.fonts
        .load(`${u.italico ? 'italic ' : ''}${u.peso ?? 400} 40px ${familiaCss(u.familia)}`)
        .catch(() => []),
    ),
  );
  await document.fonts.ready;
  avisar();
}

if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', avisar);
}

/** Muda quando alguma fonte termina de carregar: o auto-ajuste do texto mede de novo com a fonte certa. */
export function useVersaoFontes(): number {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => versao,
    () => 0,
  );
}

/** Nome com que a família foi registrada no CSS (ex.: "Space Grotesk Variable"). */
export const nomeCssDaFonte = (familia: string) => REGISTRO[familia]?.css ?? familia;

function pesoCobre(faixa: string, peso: number): boolean {
  const [a, b] = faixa.split(/\s+/).map((v) => (v === 'normal' ? 400 : v === 'bold' ? 700 : Number(v)));
  return b === undefined ? a === peso : peso >= (a as number) && peso <= b;
}

/** A fonte (família, peso e estilo) carregou de verdade? document.fonts.check() devolve true também quando a
 *  família nem existe (cai na reserva), por isso aqui procuramos o FontFace registrado e o status "loaded". */
export function fonteCarregada(u: UsoDeFonte): boolean {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const nome = nomeCssDaFonte(u.familia);
  const peso = u.peso ?? 400;
  const estilo = u.italico ? 'italic' : 'normal';
  for (const f of document.fonts as unknown as Iterable<FontFace>) {
    if (f.family.replace(/["']/g, '') !== nome || f.status !== 'loaded') continue;
    if ((f.style === 'italic' || f.style.startsWith('oblique')) !== (estilo === 'italic')) continue;
    if (pesoCobre(f.weight, peso)) return true;
  }
  return false;
}

/** Fontes pedidas que não carregaram (o arquivo sairia com a fonte reserva). */
export const fontesNaoCarregadas = (usos: UsoDeFonte[]) => usos.filter((u) => !fonteCarregada(u));
