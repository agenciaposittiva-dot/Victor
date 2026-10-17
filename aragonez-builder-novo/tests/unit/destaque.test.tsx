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
