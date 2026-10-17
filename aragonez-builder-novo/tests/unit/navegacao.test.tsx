import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ROTAS } from '@/app/rotas';

const abrir = (rota = '/') => render(<RouterProvider router={createMemoryRouter(ROTAS, { initialEntries: [rota] })} />);

describe('navegação principal', () => {
  it('abre o Dashboard com os primeiros passos e o estado vazio', async () => {
    abrir();
    expect(
      await screen.findByRole('heading', { level: 1, name: /O que vamos criar hoje\?/ }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Nenhum projeto ainda' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByTestId('modo-dados')).toHaveTextContent('Modo local');
  });

  it('troca entre Biblioteca, Editor e Brand Kits pelo menu', async () => {
    const u = userEvent.setup();
    abrir();
    await screen.findByRole('heading', { level: 1 });
    await u.click(screen.getByRole('link', { name: 'Biblioteca' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Layouts que vestem qualquer marca/ }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('link', { name: 'Editor' }));
    expect(await screen.findByRole('region', { name: 'Nenhum projeto aberto' }, { timeout: 4000 })).toBeInTheDocument();
    await u.click(screen.getByRole('link', { name: 'Brand Kits' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Um kit por cliente/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brand Kits' })).toHaveAttribute('aria-current', 'page');
  });

  it('mostra página de não encontrada para endereço inexistente', async () => {
    abrir('/nao-existe');
    expect(await screen.findByRole('region', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});
