import type { CamadaForma, Gradiente } from '@/dominio/schemas';
import { Camadas } from '@/render/Camadas';
import { ProvedorRender } from '@/render/Slide';
import { KIT_TESTE, LAYOUT_TESTE } from '@/seeds/teste';

const ANGULOS_TESTE = [0, 45, 90, 135, 180];
const W = 400;
const H = 250;

const gradiente = (angulo: number): Gradiente => ({
  tipo: 'gradiente',
  angulo,
  paradas: [
    { cor: '{cores.primaria}', pos: 0 },
    { cor: '#1F6FEB', pos: 0.45 },
    { cor: '#0A0806', pos: 1 },
  ],
});

/** Conferência do gradiente: o mesmo gradiente num retângulo (background linear-gradient do CSS) e numa forma
 *  SVG (caminho do tamanho da caixa), lado a lado, em cada ângulo. O teste de pixels compara os dois. */
export default function Gradientes() {
  return (
    <ProvedorRender layout={LAYOUT_TESTE} kit={KIT_TESTE}>
      <div style={{ display: 'grid', gap: 16, padding: 16, background: '#ffffff' }}>
        {ANGULOS_TESTE.map((a) => {
          const css: CamadaForma = {
            id: `css-${a}`,
            tipo: 'forma',
            forma: 'retangulo',
            x: 0,
            y: 0,
            w: W,
            h: H,
            preenchimento: gradiente(a),
          };
          const svg: CamadaForma = { ...css, id: `svg-${a}`, forma: 'caminho', caminho: `M0 0 H${W} V${H} H0 Z` };
          return (
            <div key={a} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div data-testid={`grad-css-${a}`} style={{ position: 'relative', width: W, height: H }}>
                <Camadas camadas={[css]} />
              </div>
              <div data-testid={`grad-svg-${a}`} style={{ position: 'relative', width: W, height: H }}>
                <Camadas camadas={[svg]} />
              </div>
              <span style={{ color: '#000', font: '14px monospace' }}>{a}°</span>
            </div>
          );
        })}
      </div>
    </ProvedorRender>
  );
}
