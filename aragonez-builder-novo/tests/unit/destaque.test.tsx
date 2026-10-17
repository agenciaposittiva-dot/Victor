import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Destaque } from '@/ui/Destaque';

describe('Destaque (interface)', () => {
  it('aplica a classe de destaque só ao trecho entre asteriscos', () => {
    const { container } = render(<Destaque texto="Prompt bonito não paga *boleto.*" />);
    const em = container.querySelectorAll('em.destaque-serif');
    expect(em).toHaveLength(1);
    expect(em[0]).toHaveTextContent('boleto.');
    expect(container).toHaveTextContent('Prompt bonito não paga boleto.');
  });
});

describe('Destaque (interface) com as regras dos slides', () => {
  it('não destaca preço com asterisco de observação', () => {
    const { container } = render(<Destaque texto="R$ 9,99* nas lojas. *Válido até 20/10" />);
    expect(container.querySelectorAll('em')).toHaveLength(0);
    expect(container).toHaveTextContent('R$ 9,99* nas lojas. *Válido até 20/10');
  });
});
