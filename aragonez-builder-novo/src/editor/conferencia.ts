import type { ArquivoFaltando, Conferencia } from '@/exportar/exportar';
import type { LugarDaImagem, ProblemasDoKit } from '@/exportar/usosDosSlides';
import { avisar } from '@/ui/toast';
import { enquadrar } from './enquadramento';
import { editor, useEditor } from './estado';
import type { Dono } from './operacoes';

/** id do campo no painel de conteúdo (para focar o campo a partir de um aviso). */
export const idDoCampo = (dono: Dono, id: string) => `campo-${dono}-${id}`;

/** "slide 2", "slides 2 e 4", "slides 1, 3 e 5" (índices a partir de 0). */
export function nosSlides(slides: number[]): string {
  const n = slides.map((i) => i + 1);
  if (n.length === 1) return `slide ${n[0]}`;
  return `slides ${n.slice(0, -1).join(', ')} e ${n.at(-1)}`;
}

// nomes de campo masculinos mais comuns ("Logo não encontrado", "Fundo está vazio"); o resto concorda com "foto"
const MASCULINOS = /^(logo|fundo|avatar|selo|ícone|icone|retrato|produto|prato)\b/i;
const concorda = (campo: string, fem: string, masc: string) => (MASCULINOS.test(campo) ? masc : fem);

const ondeEsta = (l: LugarDaImagem) => (l.slides.length ? `${l.campo}, ${nosSlides(l.slides)}` : l.campo);
export const textoDaFalta = (l: LugarDaImagem) =>
  `${ondeEsta(l)} ${concorda(l.campo, 'não encontrada', 'não encontrado')}`;
export const textoDaVazia = (l: LugarDaImagem) => `${ondeEsta(l)} ${concorda(l.campo, 'está vazia', 'está vazio')}`;
export const textoDoExemplo = (l: LugarDaImagem) =>
  `${ondeEsta(l)} ainda é ${concorda(l.campo, 'a foto', 'a imagem')} de exemplo do layout`;

/** Textos do que o kit não tem: cores (saem em magenta) e handle. */
export function textosDoKit(p: ProblemasDoKit, nomeDoKit: string): string[] {
  const onde = (s: number[]) => (!s.length ? '' : `${s.length === 1 ? ' no' : ' nos'} ${nosSlides(s)}`);
  return [
    ...p.cores.map((c) => `O kit ${nomeDoKit} não tem a cor '${c.cor}' (aparece em magenta${onde(c.slides)})`),
    ...(p.handle ? [`O kit ${nomeDoKit} não tem o @ da marca (o {handle} sai vazio${onde(p.handle)})`] : []),
  ];
}

export const temProblemaDoKit = (p: ProblemasDoKit) => p.cores.length > 0 || !!p.handle;
/** Problema: o arquivo vai sair diferente do que se vê (foto que falta, vazia, cor em magenta). */
export const temProblema = (c: Conferencia) =>
  c.faltando.length > 0 || c.vazias.length > 0 || temProblemaDoKit(c.problemasDoKit);
/** Lembrete, sem bloquear: foto de exemplo do layout que o projeto não trocou. */
export const temLembrete = (c: Conferencia) => c.deExemplo.length > 0;

/** Leva ao campo: ativa o slide, seleciona a camada e foca o campo no painel (se a camada tiver um). */
export function irAoCampo(l: { dono: Dono; slides: number[]; camadaId?: string }) {
  const slide = l.dono === 'faixa' ? (l.slides[0] ?? 0) : l.dono;
  if (useEditor.getState().modo !== 'conteudo') editor.definirModo('conteudo');
  editor.ativarSlide(slide);
  if (l.camadaId) editor.selecionar({ dono: l.dono, ids: [l.camadaId] });
  // depois do próximo desenho: o painel já mostra os campos do slide ativado
  requestAnimationFrame(() => {
    if (useEditor.getState().layout?.continuo) enquadrar('centralizar');
    const campo = l.camadaId ? document.getElementById(idDoCampo(l.dono, l.camadaId)) : null;
    campo?.scrollIntoView({ block: 'nearest' });
    campo?.focus();
  });
}

/** Leva ao primeiro slide de uma lista (avisos do kit). */
export const irAoSlide = (slides: number[]) => irAoCampo({ dono: slides[0] ?? 0, slides });

/** Depois de exportar: imagens que só falharam na captura (não estavam na conferência de antes). */
export function avisarFaltasNaCaptura(faltas: ArquivoFaltando[]) {
  if (!faltas.length) return;
  avisar(
    `${faltas.map(textoDaFalta).join('; ')}: não apareceu no arquivo exportado. Confira a foto e exporte de novo.`,
    'erro',
  );
}
