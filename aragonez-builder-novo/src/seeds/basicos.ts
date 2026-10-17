import { Layout, type LayoutEntrada } from '@/dominio/schemas';

/** Layouts em branco para criar do zero no editor (Modo Design) e depois "Salvar como layout". */
const emBranco: LayoutEntrada = {
  id: 'em-branco',
  nome: 'Em branco',
  categoria: 'Básico',
  tags: ['em branco'],
  formato: { w: 1080, h: 1350 },
  origem: 'seed',
  status: 'publicado',
  tiposDeSlide: [
    { id: 'slide', nome: 'Slide', fundo: { tipo: 'cor', cor: '{cores.fundo}' }, camadas: [], repetivel: true },
  ],
};

const emBrancoContinuo: LayoutEntrada = {
  id: 'em-branco-continuo',
  nome: 'Em branco (carrossel contínuo)',
  categoria: 'Básico',
  tags: ['em branco', 'continuo'],
  formato: { w: 1080, h: 1350 },
  continuo: true,
  origem: 'seed',
  status: 'publicado',
  faixa: { fundo: { tipo: 'cor', cor: '{cores.fundo}' }, camadas: [] },
  tiposDeSlide: [{ id: 'slide', nome: 'Slide', fundo: { tipo: 'transparente' }, camadas: [], repetivel: true }],
};

export const LAYOUT_EM_BRANCO: Layout = Layout.parse(emBranco);
export const LAYOUT_EM_BRANCO_CONTINUO: Layout = Layout.parse(emBrancoContinuo);
