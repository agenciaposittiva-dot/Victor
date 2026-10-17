import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { igual, materializar } from '@/dominio/edicao';
import { montarSlides } from '@/dominio/montagem';
import { Projeto, type CamadaTexto } from '@/dominio/schemas';
import { editor, JUNTAR_MS, projetoAtual, useEditor } from '@/editor/estado';
import { acharCamada, colar, duplicar, duplicarSlide, mover } from '@/editor/operacoes';
import { KIT_TESTE, LAYOUT_TESTE, projetoTeste } from '@/seeds/teste';

const projeto = (): Projeto =>
  Projeto.parse({
    ...projetoTeste(3),
    id: 'p',
    nome: 'P',
    layoutId: LAYOUT_TESTE.id,
    brandKitId: KIT_TESTE.id,
    formato: LAYOUT_TESTE.formato,
  });
const titulo = () => acharCamada(useEditor.getState().doc, 0, 'titulo') as CamadaTexto;

describe('estado do editor: histórico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    editor.carregar({ projeto: projeto(), layout: LAYOUT_TESTE, kit: KIT_TESTE });
  });
  afterEach(() => vi.useRealTimers());

  it('arrastar com 50 movimentos de mouse e desfazer uma vez volta à posição inicial', () => {
    const inicio = { x: titulo().x, y: titulo().y };
    editor.selecionar({ dono: 0, ids: ['titulo'] });
    editor.iniciarGesto();
    for (let i = 1; i <= 50; i++) editor.gesto((d) => mover(d.doc, 0, ['titulo'], 2, 1));
    editor.terminarGesto('Mover');
    expect([titulo().x, titulo().y]).toEqual([inicio.x + 100, inicio.y + 50]);
    expect(useEditor.getState().passado).toHaveLength(1);
    editor.desfazer();
    expect([titulo().x, titulo().y]).toEqual([inicio.x, inicio.y]);
    editor.refazer();
    expect(titulo().x).toBe(inicio.x + 100);
  });

  it('digitar uma frase e desfazer uma vez apaga a frase inteira; uma pausa de 500 ms começa outro passo', () => {
    const original = titulo().texto;
    const frase = 'Uma frase inteira';
    let atual = original;
    for (const letra of frase) {
      atual += letra;
      const t = atual;
      editor.editar(
        'Editar texto',
        (d) => void ((acharCamada(d.doc, 0, 'titulo') as CamadaTexto).texto = t),
        'texto:0:titulo',
      );
      vi.advanceTimersByTime(120); // ritmo de digitação
    }
    expect(titulo().texto).toBe(original + frase);
    expect(useEditor.getState().passado).toHaveLength(1);
    editor.desfazer();
    expect(titulo().texto).toBe(original);
    editor.refazer();
    // pausa: a próxima digitação vira outro passo
    vi.advanceTimersByTime(JUNTAR_MS + 50);
    editor.editar(
      'Editar texto',
      (d) => void ((acharCamada(d.doc, 0, 'titulo') as CamadaTexto).texto += '!'),
      'texto:0:titulo',
    );
    expect(useEditor.getState().passado).toHaveLength(2);
  });

  it('desfazer ilimitado, a seleção volta junto e desfazer depois de salvar marca alterado de novo', () => {
    for (let i = 0; i < 300; i++) editor.editar('Mover', (d) => mover(d.doc, 0, ['titulo'], 1, 0));
    expect(useEditor.getState().passado).toHaveLength(300);
    editor.selecionar({ dono: 1, ids: ['caixa'] });
    editor.editar('Mover', (d) => mover(d.doc, 1, ['caixa'], 0, 10));
    editor.selecionar({ dono: 0, ids: [] });
    useEditor.setState({ salvamento: 'salvo' });
    editor.desfazer();
    const s = useEditor.getState();
    expect(s.selecao).toEqual({ dono: 1, ids: ['caixa'] });
    expect(s.slideAtivo).toBe(1);
    expect(s.salvamento).toBe('pendente');
    for (let i = 0; i < 300; i++) editor.desfazer();
    expect(titulo().x).toBe(120);
  });

  it('cancelar o gesto (Esc) volta ao começo sem passo no histórico', () => {
    editor.iniciarGesto();
    editor.gesto((d) => mover(d.doc, 0, ['titulo'], 50, 0));
    editor.cancelarGesto();
    expect(titulo().x).toBe(120);
    expect(useEditor.getState().passado).toHaveLength(0);
  });

  it('duplicar o título, salvar e reabrir dá dois títulos independentes', () => {
    let copia = '';
    editor.editar('Duplicar', (d) => void (copia = duplicar(d.doc, 0, ['titulo'])[0]!));
    editor.editar('Editar texto', (d) => void ((acharCamada(d.doc, 0, copia) as CamadaTexto).texto = 'Cópia'));
    editor.editar('Mover', (d) => mover(d.doc, 0, ['titulo'], 30, 0));
    const salvo = projetoAtual(useEditor.getState())!;
    const reaberto = materializar(LAYOUT_TESTE, salvo);
    const ts = reaberto.slides[0]!.camadas.filter((c) => c.id.startsWith('titulo')) as CamadaTexto[];
    expect(ts.map((t) => [t.id, t.x, t.texto.startsWith('Prompt') ? 'original' : t.texto])).toEqual([
      ['titulo', 150, 'original'],
      [copia, 144, 'Cópia'],
    ]);
    expect(igual(montarSlides(LAYOUT_TESTE, salvo)[0]!.camadas, useEditor.getState().doc.slides[0]!.camadas)).toBe(
      true,
    );
  });

  it('duplicar camada, colar e duplicar slide passando pelo editor.editar (rascunho do immer)', () => {
    let copia = '';
    expect(() => editor.editar('Duplicar', (d) => void (copia = duplicar(d.doc, 0, ['titulo'])[0]!))).not.toThrow();
    expect(copia).toBe('titulo-2');
    let colada = '';
    editor.editar('Colar', (d) => void (colada = colar(d.doc, 1, [acharCamada(d.doc, 0, 'titulo')!])[0]!));
    expect(acharCamada(useEditor.getState().doc, 1, colada)).toMatchObject({ tipo: 'texto' });
    editor.editar('Duplicar slide', (d) => void duplicarSlide(d.doc, 0));
    const slides = useEditor.getState().doc.slides;
    expect(slides).toHaveLength(4);
    expect(slides[1]!.id).not.toBe(slides[0]!.id);
    // as cópias são independentes: mexer na cópia não mexe na original
    editor.editar('Mover', (d) => mover(d.doc, 1, ['titulo'], 99, 0));
    expect(acharCamada(useEditor.getState().doc, 0, 'titulo')!.x).toBe(120);
    editor.desfazer();
    editor.desfazer();
    expect(useEditor.getState().doc.slides).toHaveLength(3);
  });

  it('o projeto calculado para salvar é o mesmo objeto enquanto nada muda', () => {
    const a = projetoAtual(useEditor.getState());
    expect(projetoAtual(useEditor.getState())).toBe(a);
    editor.editar('Mover', (d) => mover(d.doc, 0, ['titulo'], 1, 0));
    expect(projetoAtual(useEditor.getState())).not.toBe(a);
  });
});
