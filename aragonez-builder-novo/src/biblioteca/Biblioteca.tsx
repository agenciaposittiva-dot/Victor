import { useNavigate } from 'react-router-dom';
import { Botao } from '@/ui/Botao';
import { Cabecalho } from '@/ui/Cabecalho';
import { Vazio } from '@/ui/Vazio';

export default function Biblioteca() {
  const navegar = useNavigate();
  return (
    <>
      <Cabecalho
        etiqueta="// Biblioteca"
        titulo="Layouts que *vestem* qualquer marca"
        texto="Carrosséis e posts reutilizáveis. Cada layout usa os tokens do Brand Kit: troque o kit e ele se re-veste inteiro."
        acoes={
          <>
            <Botao variante="secundario" icone="imagem">
              JPG → Layout
            </Botao>
            <Botao variante="primario" icone="editor" onClick={() => navegar('/editor')}>
              Criar layout no editor
            </Botao>
          </>
        }
      />
      <Vazio
        icone="biblioteca"
        titulo="A biblioteca ainda está vazia"
        texto="Os layouts aparecem aqui com miniaturas reais, busca, filtros por categoria, formato e Brand Kit, e favoritos."
        passos={[
          'Crie um layout no editor e use "Salvar como layout".',
          'Ou suba um JPG/PNG de uma arte pronta: a IA reconstrói a estrutura editável.',
          'Ou importe um layout em .json.',
        ]}
      />
    </>
  );
}
