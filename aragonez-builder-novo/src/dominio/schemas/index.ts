export * from './base';
export * from './camada';
export * from './layout';
export * from './brandkit';
export * from './projeto';

import type { z } from 'zod';

/** Resultado de validação com mensagens em português prontas para mostrar. */
export function validar<T>(
  schema: z.ZodType<T>,
  dados: unknown,
): { ok: true; valor: T } | { ok: false; erros: string[] } {
  const r = schema.safeParse(dados);
  if (r.success) return { ok: true, valor: r.data };
  return { ok: false, erros: r.error.issues.map((i) => (i.path.length ? i.path.join('.') + ': ' : '') + i.message) };
}
