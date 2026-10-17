import { Botao } from '@/ui/Botao';
import { Cabecalho } from '@/ui/Cabecalho';
import { Vazio } from '@/ui/Vazio';

export default function BrandKits() {
  return (
    <>
      <Cabecalho
        etiqueta="// Brand Kits"
        titulo="Um kit por *cliente*"
        texto="Cores nomeadas, fontes, logos, assets, @handle e tom de voz. Os layouts leem estes tokens, então a mesma estrutura serve para marcas diferentes."
        acoes={
          <Botao variante="primario" icone="mais">
            Novo Brand Kit
          </Botao>
        }
      />
      <Vazio
        icone="kits"
        titulo="Nenhum Brand Kit ainda"
        texto="Crie o kit de um cliente para reaplicar qualquer layout na identidade dele. Os kits Victor Aragonez e Feira Nova vêm prontos."
      />
    </>
  );
}
