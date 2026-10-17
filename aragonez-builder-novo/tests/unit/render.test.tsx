import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { montarSlides } from '@/dominio/montagem';
import { Layout, type Camada, type LayoutEntrada } from '@/dominio/schemas';
import { estatisticasDaMedida } from '@/render/medida';
import { Faixa, ProvedorRender, Slide } from '@/render/Slide';
import { KIT_TESTE } from '@/seeds/teste';

const tituloAuto = (id: string, texto: string): Camada => ({
  id,
  tipo: 'texto',
  x: 0,
  y: 0,
  w: 600,
  h: 200,
  texto,
  tamanho: 90,
  autoAjuste: true,
});

const entrada: LayoutEntrada = {
  id: 'l',
  nome: 'L',
  categoria: 'teste',
  formato: { w: 1080, h: 1350 },
  continuo: true,
  faixa: { camadas: [] },
  tiposDeSlide: [
    {
      id: 'a',
      nome: 'A',
      fundo: { tipo: 'cor', cor: '#000000' },
      camadas: [
        { id: 'num', tipo: 'texto', x: 0, y: 0, w: 200, h: 40, texto: '{slide}/{total}' },
        {
          id: 'barra',
          tipo: 'forma',
          forma: 'progresso',
          x: 0,
          y: 1300,
          w: 1000,
          h: 10,
          preenchimento: '#ffffff',
          trilho: '#333333',
        },
        tituloAuto('titulo', 'Título'),
      ],
    },
  ],
};
const LAYOUT = Layout.parse(entrada);
const slide = (id: string, titulo: string) => ({
  id,
  tipoId: 'a',
  conteudo: { titulo },
  overrides: {},
  camadasExtras: [],
});

describe('render: numeração, progresso e medida', () => {
  it('{slide}/{total} e a barra de progresso acompanham a posição do slide', () => {
    const projeto = { slides: [slide('s1', 'Um'), slide('s2', 'Dois'), slide('s3', 'Três'), slide('s4', 'Quatro')] };
    const slides = montarSlides(LAYOUT, projeto);
    const { container } = render(
      <ProvedorRender layout={LAYOUT} kit={KIT_TESTE}>
        <Faixa layout={LAYOUT} slides={slides} />
      </ProvedorRender>,
    );
    const nums = [...container.querySelectorAll('[data-camada="num"]')].map((e) => e.textContent);
    expect(nums).toEqual(['1/4', '2/4', '3/4', '4/4']);
    const barras = [...container.querySelectorAll<HTMLElement>('[data-camada="barra"] > div')].map(
      (e) => e.style.width,
    );
    expect(barras).toEqual(['250px', '500px', '750px', '1000px']);
  });

  it('reordenar slides atualiza a numeração', () => {
    const p = { slides: [slide('s1', 'Um'), slide('s2', 'Dois')] };
    const invertido = { slides: [p.slides[1]!, p.slides[0]!] };
    const { container } = render(
      <ProvedorRender layout={LAYOUT} kit={KIT_TESTE}>
        <Slide slide={montarSlides(LAYOUT, invertido)[0]!} w={1080} h={1350} total={2} />
      </ProvedorRender>,
    );
    expect(container.querySelector('[data-camada="num"]')!.textContent).toBe('1/2');
    expect(container.querySelector('[data-camada="titulo"]')!.textContent).toBe('Dois');
  });

  it('editar um texto mede só ele: os outros slides não são medidos de novo', () => {
    const p1 = { slides: [slide('s1', 'Primeiro título'), slide('s2', 'Segundo título'), slide('s3', 'Terceiro')] };
    const desenhar = (p: typeof p1) => (
      <ProvedorRender layout={LAYOUT} kit={KIT_TESTE}>
        <Faixa layout={LAYOUT} slides={montarSlides(LAYOUT, p)} />
      </ProvedorRender>
    );
    const { rerender } = render(desenhar(p1));
    const antes = estatisticasDaMedida.buscas;
    // como no editor: só o objeto do slide editado muda, os outros continuam os mesmos
    const p2 = {
      slides: [p1.slides[0]!, { ...p1.slides[1]!, conteudo: { titulo: 'Segundo título!' } }, p1.slides[2]!],
    };
    rerender(desenhar(p2));
    expect(estatisticasDaMedida.buscas - antes).toBe(1);
    // voltar ao texto anterior não mede de novo (está no cache)
    rerender(desenhar(p1));
    expect(estatisticasDaMedida.buscas - antes).toBe(1);
  });
});
