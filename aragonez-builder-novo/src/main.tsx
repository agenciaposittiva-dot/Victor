import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { criarRoteador } from './app/rotas';
import { ferramentasDeDesenvolvimento } from './dados/catalogo';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado');

// ganchos dos testes automáticos em qualquer tela (ferramenta de desenvolvimento, só com ?teste na URL; item T1)
if (ferramentasDeDesenvolvimento() && new URLSearchParams(location.search).has('teste'))
  void import('./laboratorio/ganchos').then((m) => m.registrarGanchosDeDados());

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={criarRoteador()} />
  </StrictMode>,
);
