import { Projetos } from '@/projetos/Projetos';
import { Cabecalho } from '@/ui/Cabecalho';

/** /editor sem projeto: a lista de projetos para abrir (ou criar um novo). */
export default function InicioDoEditor() {
  return (
    <>
      <Cabecalho
        etiqueta="// Editor"
        titulo="Editor *visual*"
        texto="Modo Conteúdo para o dia a dia (só os campos editáveis) e Modo Design para criar e ajustar layouts com liberdade total."
      />
      <Projetos
        vazio={{
          titulo: 'Nenhum projeto aberto',
          texto: 'Crie um projeto a partir de um layout. Ele abre no editor e fica salvo neste navegador.',
        }}
      />
    </>
  );
}
