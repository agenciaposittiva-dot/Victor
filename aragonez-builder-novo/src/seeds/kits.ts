import type { BrandKit } from '@/dominio/schemas';

/** Kit neutro do app: serve para começar do zero até existir o kit do cliente (Fase 4a traz os kits prontos). */
export const KIT_NEUTRO: BrandKit = {
  id: 'kit-neutro',
  nome: 'Neutro',
  cores: {
    primaria: '#FF5A1F',
    secundaria: '#1F1A16',
    fundo: '#F6F1EB',
    texto: '#171310',
    suave: '#7A6E64',
    preto: '#0A0806',
    branco: '#FFFFFF',
  },
  fontes: {
    titulo: { familia: 'Space Grotesk', peso: 500, origem: 'local' },
    corpo: { familia: 'Space Grotesk', peso: 400, origem: 'local' },
    destaque: { familia: 'Instrument Serif', peso: 400, italico: true, origem: 'local' },
    etiqueta: { familia: 'JetBrains Mono', peso: 500, origem: 'local' },
  },
  logos: [],
  assets: [],
  handle: '@seuperfil',
  versaoSchema: 1,
};
