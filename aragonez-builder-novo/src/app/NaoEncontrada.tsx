import { useNavigate } from 'react-router-dom';
import { Botao } from '@/ui/Botao';
import { Vazio } from '@/ui/Vazio';

export default function NaoEncontrada() {
  const navegar = useNavigate();
  return (
    <Vazio
      icone="busca"
      titulo="Página não encontrada"
      texto="O endereço não existe ou mudou de lugar."
      acoes={
        <Botao variante="primario" onClick={() => navegar('/')}>
          Ir para o Dashboard
        </Botao>
      }
    />
  );
}
