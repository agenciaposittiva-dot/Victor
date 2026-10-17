import type { CSSProperties } from 'react';
import type { Fundo as TFundo } from '@/dominio/schemas';
import { resolverCor, resolverPreenchimento } from '@/dominio/tokens';
import { estiloBrilho } from './fundoEstilo';
import { useRender } from './contexto';

const cheio: CSSProperties = { position: 'absolute', inset: 0 };

export function Fundo({ fundo, w, h }: { fundo: TFundo; w: number; h: number }) {
  const { kit, urlDoAsset } = useRender();
  const base: CSSProperties = { ...cheio, width: w, height: h, overflow: 'hidden' };
  switch (fundo.tipo) {
    case 'transparente':
      return null;
    case 'cor':
      return <div data-fundo style={{ ...base, background: resolverCor(fundo.cor, kit) }} />;
    case 'gradiente':
      return <div data-fundo style={{ ...base, background: resolverPreenchimento(fundo, kit) }} />;
    case 'imagem': {
      const url = (fundo.assetId ? urlDoAsset?.(fundo.assetId) : undefined) || fundo.url;
      const foco = fundo.foco ?? { x: 0.5, y: 0.5 };
      return (
        <div data-fundo style={{ ...base, background: resolverCor(fundo.cor, kit) ?? '#111111' }}>
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                ...cheio,
                width: '100%',
                height: '100%',
                objectFit: fundo.ajuste,
                objectPosition: `${foco.x * 100}% ${foco.y * 100}%`,
              }}
            />
          )}
        </div>
      );
    }
    case 'brilhos':
      return (
        <div data-fundo style={{ ...base, background: resolverCor(fundo.base, kit) }}>
          {fundo.brilhos.map((b, i) => (
            <div key={i} style={estiloBrilho(b, kit)} />
          ))}
        </div>
      );
  }
}
