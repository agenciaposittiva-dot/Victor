import { AvisoFixo } from '@/ui/AvisoFixo';
import { Botao } from '@/ui/Botao';
import { useAvisoDoBanco, type AvisoDoBancoAtivo } from './avisoDoBanco';

/** O cartão de um aviso do banco (o editor põe na pilha de avisos, pela urgência). */
export function CartaoDoBanco({ aviso }: { aviso: AvisoDoBancoAtivo }) {
  if (aviso === 'banco-atualizado')
    return (
      <AvisoFixo
        tipo="erro"
        titulo="O armazenamento foi atualizado em outra aba"
        testid="aviso-banco"
        acoes={
          <Botao tamanho="pequeno" variante="primario" onClick={() => location.reload()}>
            Recarregar esta aba
          </Botao>
        }
      >
        Esta aba parou de salvar para não estragar os dados. Recarregue para continuar.
      </AvisoFixo>
    );
  if (aviso === 'banco-bloqueado')
    return (
      <AvisoFixo
        tipo="aviso"
        titulo="Feche as outras abas do Aragonez Builder"
        testid="aviso-banco"
        acoes={
          <Botao tamanho="pequeno" onClick={() => location.reload()}>
            Já fechei, tentar de novo
          </Botao>
        }
      >
        Outra aba aberta impede a atualização do armazenamento deste navegador.
      </AvisoFixo>
    );
  return null;
}

/** Avisos fixos do armazenamento local: o banco foi atualizado em outra aba (esta precisa recarregar) ou outra aba
 *  está impedindo a atualização (fechar as outras abas). Ficam na tela até a pessoa agir. */
export function AvisosDoBanco() {
  return <CartaoDoBanco aviso={useAvisoDoBanco()} />;
}
