import { memo, useEffect, useMemo } from 'react';
import { arquivosDoDocumento, carregarArquivos, urlDoArquivo, useVersaoArquivos } from '@/dados/arquivos';
import { layoutComFaixa, montarSlides } from '@/dominio/montagem';
import type { BrandKit, Layout, Projeto } from '@/dominio/schemas';
import { fontesDosSlides } from '@/exportar/fontesUsadas';
import { garantirFontes } from '@/render/fontes';
import { Escala, JanelaDaFaixa, ProvedorRender, Slide } from '@/render/Slide';

/** Miniatura real do primeiro slide (o mesmo renderizador da exportação, em escala). */
export const Miniatura = memo(function Miniatura({
  projeto,
  layout,
  kit,
  largura,
  indice = 0,
}: {
  projeto?: Pick<Projeto, 'slides'> & Partial<Pick<Projeto, 'faixaOverrides' | 'faixaExtras' | 'faixaOrdem'>>;
  layout: Layout;
  kit: BrandKit;
  largura: number;
  indice?: number;
}) {
  const versaoArquivos = useVersaoArquivos();
  const urlDoAsset = useMemo(() => (id: string) => urlDoArquivo(id), [versaoArquivos]); // eslint-disable-line react-hooks/exhaustive-deps
  const slides = useMemo(() => montarSlides(layout, projeto), [layout, projeto]);
  const efetivo = useMemo(() => layoutComFaixa(layout, projeto), [layout, projeto]);
  const { w, h } = layout.formato;
  const i = Math.min(indice, slides.length - 1);
  useEffect(() => {
    garantirFontes(fontesDosSlides(layout, slides, kit, projeto)).catch(() => undefined);
    // só as fotos do slide mostrado (e da faixa, que atravessa), não as do projeto inteiro
    const mostrado = slides[i];
    void carregarArquivos(
      arquivosDoDocumento({
        slides: mostrado ? [{ id: '', tipoId: '', camadas: mostrado.camadas, fundo: mostrado.fundo }] : [],
        faixa: efetivo.faixa?.camadas ?? [],
      }),
    );
  }, [layout, slides, kit, projeto, efetivo, i]);
  return (
    <ProvedorRender layout={efetivo} kit={kit} urlDoAsset={urlDoAsset}>
      <Escala escala={largura / w} w={w} h={h}>
        {layout.continuo ? (
          <JanelaDaFaixa layout={efetivo} slides={slides} indice={i} />
        ) : (
          <Slide slide={slides[i]!} w={w} h={h} total={slides.length} />
        )}
      </Escala>
    </ProvedorRender>
  );
});
