import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Shell } from './Shell';

const Dashboard = lazy(() => import('@/dashboard/Dashboard'));
const Biblioteca = lazy(() => import('@/biblioteca/Biblioteca'));
const Editor = lazy(() => import('@/editor/Editor'));
const BrandKits = lazy(() => import('@/brandkits/BrandKits'));
const NaoEncontrada = lazy(() => import('./NaoEncontrada'));
const Laboratorio = lazy(() => import('@/laboratorio/Laboratorio'));

const carregando = (el: ReactNode) => <Suspense fallback={<p aria-busy="true">Carregando…</p>}>{el}</Suspense>;

export const ROTAS: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: carregando(<Dashboard />) },
      { path: 'biblioteca', element: carregando(<Biblioteca />) },
      { path: 'editor', element: carregando(<Editor />) },
      { path: 'editor/:projetoId', element: carregando(<Editor />) },
      { path: 'kits', element: carregando(<BrandKits />) },
      { path: 'laboratorio', element: carregando(<Laboratorio />) },
      { path: '*', element: carregando(<NaoEncontrada />) },
    ],
  },
];

export const criarRoteador = () => createBrowserRouter(ROTAS);
