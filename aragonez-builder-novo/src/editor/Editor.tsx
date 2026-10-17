import { useNavigate, useParams } from 'react-router-dom';
import { Botao } from '@/ui/Botao';
import { Cabecalho } from '@/ui/Cabecalho';
import { Vazio } from '@/ui/Vazio';

export default function Editor() {
  const { projetoId } = useParams();
  const navegar = useNavigate();
  return (
    <>
      <Cabecalho
        etiqueta="// Editor"
        titulo={projetoId ? 'Projeto não encontrado' : 'Editor *visual*'}
        texto="Modo Conteúdo para o dia a dia (só os campos editáveis) e Modo Design para criar e ajustar layouts com liberdade total."
      />
      <Vazio
        icone="editor"
        titulo={projetoId ? 'Este projeto não existe ou foi excluído' : 'Nenhum projeto aberto'}
        texto="Abra um projeto do Dashboard ou comece a partir de um layout da biblioteca."
        acoes={
          <>
            <Botao variante="primario" icone="biblioteca" onClick={() => navegar('/biblioteca')}>
              Escolher um layout
            </Botao>
            <Botao variante="secundario" icone="painel" onClick={() => navegar('/')}>
              Ver projetos
            </Botao>
            <Botao variante="fantasma" icone="exportar" onClick={() => navegar('/laboratorio')}>
              Testar a exportação
            </Botao>
          </>
        }
      />
    </>
  );
}
