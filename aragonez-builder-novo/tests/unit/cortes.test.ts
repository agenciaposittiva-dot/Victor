// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORTE_CELULAR, TELA_PEQUENA } from '@/ui/useTelaPequena';

const SRC = join(__dirname, '../../src');
const cssDe = (pasta: string): string[] =>
  readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssDe(join(pasta, e.name)) : e.name.endsWith('.css') ? [join(pasta, e.name)] : [],
  );

describe('corte do celular num número só', () => {
  it('todo @media de celular (max-width) dos .css de src usa o mesmo corte do JS', () => {
    const usos = cssDe(SRC).flatMap((arq) =>
      [...readFileSync(arq, 'utf8').matchAll(/@media([^{]*)\{/g)]
        .map((m) => m[1]!)
        .filter((q) => /max-width/.test(q))
        .map((q) => ({ arquivo: arq.slice(SRC.length + 1), largura: Number(/max-width:\s*(\d+)px/.exec(q)?.[1]) })),
    );
    expect(usos.length).toBeGreaterThan(0);
    expect(usos.filter((u) => u.largura !== CORTE_CELULAR)).toEqual([]);
    expect(TELA_PEQUENA).toBe(`(max-width: ${CORTE_CELULAR}px)`);
  });
});
